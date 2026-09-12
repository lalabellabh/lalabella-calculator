/* Lalabella Supabase flower catalog adapter.
 * Browser-safe: uses only the project's publishable key through the
 * shared Supabase client. No Google Apps Script / Google Sheets calls.
 */
(function () {
  'use strict';

  window.LalabellaFlowerAPI = {
    async getCatalog() {
      await window.LalabellaSupabase.ready();
      const sb = window.LalabellaSupabase.client;
      const { data, error } = await sb
        .from('flower_item')
        .select('id,flower_name,rate,origin,status')
        .eq('status', 'Active')
        .order('flower_name');
      if (error) throw error;

      const rows = (data || [])
        .map(it => ({
          id: it.id,
          name: String(it.flower_name || '').trim(),
          rate: Number(it.rate) || 0,
          origin: String(it.origin || '').trim()
        }))
        .filter(it => it.name);

      const legacy = rows.filter(it => it.origin.toLowerCase() === 'legacy/unknown');
      const legacyNames = new Set(legacy.map(it => it.name.toLowerCase()));
      const holland = rows.filter(it =>
        it.origin.toLowerCase() === 'holland' && !legacyNames.has(it.name.toLowerCase())
      );
      return legacy.concat(holland);
    }
  };
})();
