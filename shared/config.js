/**
 * LALABELLA CONFIG — the ONE place for every backend (Apps Script) URL.
 *
 * Every page loads this first (before auth-guard.js) and reads its URL
 * from here, e.g.  fetch(LB_CONFIG.FLOWER_API + '?action=...').
 *
 * If a backend is redeployed with a NEW /exec URL, change it here only.
 * (Normally it never changes: always deploy with Manage deployments →
 *  Edit → New version, which keeps the same URL.)
 */
window.LB_CONFIG = Object.freeze({
  AUTH_API:         'https://script.google.com/macros/s/AKfycbxKYKjmEfD7NXNmC5P9acKvvrTbUf3GE061VoKMUb0l_miYPVJ_JbpiyG7Nrjs2y2b2/exec',
  CHOCOLATE_API:    'https://script.google.com/macros/s/AKfycbznLqWonLj9K1NR0kb3KfzZcSTxbxCMEJJS9CQFYd6GYcGPv9Alwk2dO4mpjwxGVg/exec',
  FLOWER_API:       'https://script.google.com/macros/s/AKfycbzC-h3iV0AJU0A3mKhj_0V5-yOeLoJYlupFlPnKHelbyhcSiqUbK6LTjgo4qZF03Bs/exec',
  ITEM_API:         'https://script.google.com/macros/s/AKfycbwvypHTqixncjrdw1RUdUZEQ7u8xDZOhPCKtYK3w3BboXkBCNaxqFwfiaD7o7ZHsMY/exec',
  ORDER_ASSIGN_API: 'https://script.google.com/macros/s/AKfycbyD9RV8ATs0uLjjkyCVcRiM4aYZPttDredD3BZsE1vbv61gER6A3oT00_BkMUR5FPE/exec',
  ORDER_FORM_API:   'https://script.google.com/macros/s/AKfycbxK3UQUK0xUGT545Y294raGz9IOFrTtNNaUvRA8XeEmNtZewJJ4XXX16zpEcVGTo3I/exec',
  NOTES_API:        'https://script.google.com/macros/s/AKfycbxlbXl4V2PPYKVp7rjbJaGG7lYX_7Bc28MhkzOcUoSoEhLfTIu3c3BH0gxwFZf5AE2x/exec',
  SCHEDULE_API:     'https://script.google.com/macros/s/AKfycbwp9vFxJFCfQtBZY0VQVMxXNw3BxPnfFSAzNrqVC-WBq3h7-YlzuhHBWucte6pcSf4/exec',
  SUPPLY_LOG_API:   'https://script.google.com/macros/s/AKfycbyvQl0VEx-SObaV5CMeKK-sDEopFH0X-rauQkElWPW7N_Hraxsuth-odm_rW-SVMzk/exec',
  PETTY_CASH_API:   'https://script.google.com/macros/s/AKfycbxz53pJEQIEOgvfUIxwhcOcdZtu7An4qXwShP7a58bVjvJSPm8ORs4eP6lv-kdKJBdT/exec',
  NOVA_API:         'https://script.google.com/macros/s/AKfycbxuH9jp_GYVK2VyEEvQiEiXVH58U3RBWV8p7i5Pu7plE1O2cDsFBgdVgEwLiV-On9w/exec'
});
