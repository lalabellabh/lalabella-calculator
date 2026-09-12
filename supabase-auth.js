/* Lalabella Supabase Auth adapter.
 * This is intentionally independent from the legacy Google Apps Script auth.
 */
(function () {
  'use strict';

  async function client() {
    if (!window.LalabellaSupabase) throw new Error('Supabase client helper is not loaded');
    return window.LalabellaSupabase.ready();
  }

  window.LalabellaAuth = Object.freeze({
    async signIn(email, password) {
      const supabase = await client();
      return supabase.auth.signInWithPassword({ email, password });
    },

    async signOut() {
      const supabase = await client();
      return supabase.auth.signOut();
    },

    async getUser() {
      const supabase = await client();
      return supabase.auth.getUser();
    },

    async getSession() {
      const supabase = await client();
      return supabase.auth.getSession();
    },

    async getProfile() {
      const supabase = await client();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) return { data: null, error: userError };
      if (!user) return { data: null, error: null };
      return supabase.from('profiles')
        .select('id, username, full_name, role, branch, photo_link, created_at, updated_at')
        .eq('id', user.id)
        .maybeSingle();
    },

    async onAuthStateChange(callback) {
      const supabase = await client();
      return supabase.auth.onAuthStateChange(callback);
    }
  });
})();
