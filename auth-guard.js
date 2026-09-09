/**
 * LALABELLA AUTH — Login/Register/Token Verification
 * Google Apps Script backend, bound to the "Lalabella Users" Sheet.
 *
 * SETUP (do this before anything works):
 * 1) Bind this script to the "Lalabella Users" spreadsheet:
 *    Open the Sheet → Extensions → Apps Script → paste this file.
 * 2) Project Settings → Script Properties → add:
 *      PEPPER = <a long random secret string, different from any password>
 *      AUTH_TOKEN = <a second long random secret — this is the ONE all
 *                    other backends (Chocolate/Flower/Item Inventory/
 *                    Joyboy) will be given to call verifyToken with>
 * 3) Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 * 4) Copy the /exec URL into every frontend page's login flow, and give
 *    the AUTH_TOKEN value to the OTHER backends (as a Script Property
 *    there too) so they can call verifyToken_ against this one.
 *
 * SECURITY NOTES:
 * - Passwords are NEVER stored in plain text — only SHA-256(password +
 *   PEPPER), hex-encoded. The PEPPER lives in Script Properties, never
 *   in the Sheet or in any frontend code, so the hash alone (even if
 *   someone saw the whole Sheet) isn't crackable without it.
 * - Every login issues a random session TOKEN, saved back into the
 *   user's row. Every other backend must validate this token (via the
 *   verifyToken action here) before returning ANY data — this is what
 *   makes the system secure even if someone finds a backend's raw URL.
 * - The two diagnostic actions below (debugProfile, debugHash) are
 *   gated behind AUTH_TOKEN itself (the same secret only trusted
 *   backends/developers have) via &debugKey=... — and neither one
 *   ever echoes a live session token or the PEPPER back in its
 *   response. A debug endpoint must never leak the credential that
 *   protects it, or the raw material used to prove identity.
 */

const PROFILE_PHOTOS_FOLDER_ID = '1pL-XwgAum-QmFm1Cw5AnTfAlKgAW53ZL';

function doPost(e) { return doGet(e); }

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];

  if (action === 'register') return handleRegister_(sheet, e);
  if (action === 'login') return handleLogin_(sheet, e);
  if (action === 'verifyToken') return handleVerifyToken_(sheet, e);
  if (action === 'logout') return handleLogout_(sheet, e);
  if (action === 'getProfile') return handleGetProfile_(sheet, e);
  if (action === 'debugProfile') return handleDebugProfile_(sheet, e);
  if (action === 'updateProfile') return handleUpdateProfile_(sheet, e);
  if (action === 'changePassword') return handleChangePassword_(sheet, e);
  if (action === 'debugHash') return handleDebugHash_(e);

  return json_({ error: 'Unknown action', receivedAction: action || '(none)', marker: 'AUTH-DEPLOY-v1-CONFIRMED' });
}

// Shared gate for the two diagnostic-only actions below — requires
// the SAME secret used as AUTH_TOKEN (the one other backends use to
// call verifyToken). Only someone who already has developer-level
// access to Script Properties knows this, so a random visitor who
// merely discovers this URL can't invoke either diagnostic.
function isDebugCallerAuthorized_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  const supplied = String((e && e.parameter && e.parameter.debugKey) || '');
  return !!expected && supplied === expected;
}

// ---------- Register ----------
function handleRegister_(sheet, e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const username = String(e.parameter.username || '').trim();
    const password = String(e.parameter.password || '');
    const fullName = String(e.parameter.fullName || '').trim();
    const branch = String(e.parameter.branch || '').trim();

    if (!username || !password || !fullName || !branch) {
      return json_({ success: false, error: 'All fields are required.' });
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const iUsername = headers.indexOf('Username');

    // Case-insensitive duplicate check — "Admin" and "admin" are the same account.
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iUsername]).toLowerCase() === username.toLowerCase()) {
        return json_({ success: false, error: 'That username is already taken.' });
      }
    }

    const passwordHash = hashPassword_(password);
    // Role is ALWAYS "Staff" at registration — nothing in this request
    // can grant Admin. Upgrading a role is a manual edit in the Sheet
    // itself, by someone who already has edit access to it.
    sheet.appendRow([username, passwordHash, fullName, 'Staff', branch, new Date(), '', '', '', 0, '']);

    return json_({ success: true, message: 'Registered successfully. You can now log in.' });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Login ----------
function handleLogin_(sheet, e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const username = String(e.parameter.username || '').trim();
    const password = String(e.parameter.password || '');

    if (!username || !password) {
      return json_({ success: false, error: 'Username and password are required.' });
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const iUsername = headers.indexOf('Username');
    const iHash = headers.indexOf('PasswordHash');
    const iFullName = headers.indexOf('FullName');
    const iRole = headers.indexOf('Role');
    const iBranch = headers.indexOf('Branch');
    const iToken = headers.indexOf('Token');
    const iTokenCreated = headers.indexOf('TokenCreated');
    const iFailedAttempts = headers.indexOf('FailedAttempts');
    const iLockedUntil = headers.indexOf('LockedUntil');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iUsername]).toLowerCase() === username.toLowerCase()) {

        // Locked out — 5 failed attempts in a row triggers a 30-minute
        // cooldown before this account can try again at all, checked
        // BEFORE the password is even compared (so a locked account
        // never leaks whether a guessed password would've worked).
        if (iLockedUntil !== -1 && data[i][iLockedUntil] instanceof Date) {
          const lockedUntil = data[i][iLockedUntil];
          if (Date.now() < lockedUntil.getTime()) {
            const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
            return json_({ success: false, error: 'Too many failed attempts. Try again in ' + minutesLeft + ' minute(s).' });
          }
        }

        const expectedHash = hashPassword_(password);
        if (data[i][iHash] !== expectedHash) {
          if (iFailedAttempts !== -1) {
            const currentAttempts = (Number(data[i][iFailedAttempts]) || 0) + 1;
            sheet.getRange(i + 1, iFailedAttempts + 1).setValue(currentAttempts);
            if (currentAttempts >= 5 && iLockedUntil !== -1) {
              const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
              sheet.getRange(i + 1, iLockedUntil + 1).setValue(lockUntil);
              return json_({ success: false, error: 'Too many failed attempts. Account locked for 30 minutes.' });
            }
          }
          return json_({ success: false, error: 'Incorrect username or password.' });
        }

        // Correct password — clear any failed-attempt count/lock.
        if (iFailedAttempts !== -1) sheet.getRange(i + 1, iFailedAttempts + 1).setValue(0);
        if (iLockedUntil !== -1) sheet.getRange(i + 1, iLockedUntil + 1).setValue('');

        const token = generateToken_();
        sheet.getRange(i + 1, iToken + 1).setValue(token);
        sheet.getRange(i + 1, iTokenCreated + 1).setValue(new Date());

        return json_({
          success: true,
          token: token,
          user: {
            username: data[i][iUsername],
            fullName: data[i][iFullName],
            role: data[i][iRole],
            branch: data[i][iBranch]
          }
        });
      }
    }

    return json_({ success: false, error: 'Incorrect username or password.' });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Logout ----------
function handleLogout_(sheet, e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const token = String(e.parameter.token || '');
    if (!token) return json_({ success: true }); // nothing to clear

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const iToken = headers.indexOf('Token');

    for (let i = 1; i < data.length; i++) {
      if (data[i][iToken] === token) {
        sheet.getRange(i + 1, iToken + 1).setValue('');
        break;
      }
    }
    return json_({ success: true });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Verify Token ----------
// Called by THIS backend's own frontend pages, AND by every other
// backend (Chocolate/Flower/Item Inventory/Joyboy) before they hand
// back any data — the single shared gate the whole system relies on.
// Requires a second secret (AUTH_TOKEN) so that only backends that
// were deliberately given it can even ask "is this session valid?".
function handleVerifyToken_(sheet, e) {
  const callerSecret = String(e.parameter.callerSecret || '');
  const expectedSecret = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  if (!expectedSecret || callerSecret !== expectedSecret) {
    return json_({ valid: false, error: 'Unauthorized caller.' });
  }

  const token = String(e.parameter.token || '');
  if (!token) return json_({ valid: false });

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const iToken = headers.indexOf('Token');
  const iUsername = headers.indexOf('Username');
  const iFullName = headers.indexOf('FullName');
  const iRole = headers.indexOf('Role');
  const iBranch = headers.indexOf('Branch');
  const iTokenCreated = headers.indexOf('TokenCreated');

  for (let i = 1; i < data.length; i++) {
    if (data[i][iToken] === token) {
      // Optional session expiry — 24 hours from token creation.
      const created = data[i][iTokenCreated];
      if (created instanceof Date) {
        const ageMs = Date.now() - created.getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          return json_({ valid: false, error: 'Session expired.' });
        }
      }
      return json_({
        valid: true,
        user: {
          username: data[i][iUsername],
          fullName: data[i][iFullName],
          role: data[i][iRole],
          branch: data[i][iBranch]
        }
      });
    }
  }
  return json_({ valid: false });
}

// ---------- Get Profile ----------
function handleGetProfile_(sheet, e) {
  const auth = verifyTokenInline_(sheet, e.parameter.token);
  if (!auth.valid) return json_({ success: false, error: 'Unauthorized.' });

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const iUsername = headers.indexOf('Username');
  const iFullName = headers.indexOf('FullName');
  const iRole = headers.indexOf('Role');
  const iBranch = headers.indexOf('Branch');
  const iPhoto = headers.indexOf('PhotoLink');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iUsername]).toLowerCase() === auth.username.toLowerCase()) {
      return json_({
        success: true,
        profile: {
          username: data[i][iUsername],
          fullName: data[i][iFullName],
          role: data[i][iRole],
          branch: data[i][iBranch],
          photoDataUri: iPhoto !== -1 ? profilePhotoToDataUri_(data[i][iPhoto]) : ''
        }
      });
    }
  }
  return json_({ success: false, error: 'Profile not found.' });
}

// Diagnostic-only action — shows the RAW PhotoLink column value (the
// bare Drive file ID, before it's converted to a data URI), plus
// whether the Drive lookup for it actually succeeded. This isolates
// exactly where a "photo doesn't come back" problem is: nothing ever
// got saved to the column (PhotoLink shows empty), or something WAS
// saved but reading it back from Drive is failing.
//
// GATED behind &debugKey=<AUTH_TOKEN> (see isDebugCallerAuthorized_)
// — only someone with developer-level access to Script Properties
// can call this. It also NEVER echoes a live session token in the
// response: only whether the supplied token matches (a boolean),
// never the actual token value stored in the Sheet for any row.
function handleDebugProfile_(sheet, e) {
  if (!isDebugCallerAuthorized_(e)) {
    return json_({ error: 'Unauthorized.' });
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const iToken = headers.indexOf('Token');
  const iUsername = headers.indexOf('Username');
  const iPhoto = headers.indexOf('PhotoLink');
  const suppliedToken = String(e.parameter.token || '').trim();

  const allTokensInSheet = [];
  for (let i = 1; i < data.length; i++) {
    allTokensInSheet.push({
      username: iUsername !== -1 ? data[i][iUsername] : '(no Username column)',
      hasToken: iToken !== -1 && String(data[i][iToken]).trim() !== '',
      tokenLength: iToken !== -1 ? String(data[i][iToken]).length : 0,
      matchesSupplied: iToken !== -1 && String(data[i][iToken]).trim() === suppliedToken
    });
  }

  return json_({
    marker: 'PROFILE-DEBUG-v3-CONFIRMED',
    headersFound: headers,
    tokenColumnIndex: iToken,
    photoLinkColumnIndex: iPhoto,
    suppliedTokenLength: suppliedToken.length,
    allRows: allTokensInSheet
  });
}

// Diagnostic-only action — lets a developer confirm what a given
// plaintext password would hash to, WITHOUT ever revealing the
// PEPPER itself (the response only ever proves "hashing is
// configured", never what the secret actually is).
//
// GATED behind &debugKey=<AUTH_TOKEN>, same as handleDebugProfile_.
function handleDebugHash_(e) {
  if (!isDebugCallerAuthorized_(e)) {
    return json_({ error: 'Unauthorized.' });
  }
  const pw = String(e.parameter.password || '');
  return json_({
    computedHash: hashPassword_(pw),
    pepperConfigured: !!PropertiesService.getScriptProperties().getProperty('PEPPER')
  });
}

// ---------- Update Profile (name, branch, photo — NOT role, NOT username) ----------
function handleUpdateProfile_(sheet, e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const auth = verifyTokenInline_(sheet, e.parameter.token);
    if (!auth.valid) return json_({ success: false, error: 'Unauthorized.' });

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const iUsername = headers.indexOf('Username');
    const iFullName = headers.indexOf('FullName');
    const iBranch = headers.indexOf('Branch');
    const iPhoto = headers.indexOf('PhotoLink');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iUsername]).toLowerCase() === auth.username.toLowerCase()) {
        if (e.parameter.fullName) sheet.getRange(i + 1, iFullName + 1).setValue(e.parameter.fullName);
        if (e.parameter.branch) sheet.getRange(i + 1, iBranch + 1).setValue(e.parameter.branch);
        if (e.parameter.photoBase64 && iPhoto !== -1) {
          const fileId = saveProfilePhotoToDrive_(e.parameter.photoBase64, auth.username);
          sheet.getRange(i + 1, iPhoto + 1).setValue(fileId);
        }
        return json_({ success: true, message: 'Profile updated.' });
      }
    }
    return json_({ success: false, error: 'Profile not found.' });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Change Password ----------
function handleChangePassword_(sheet, e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const auth = verifyTokenInline_(sheet, e.parameter.token);
    if (!auth.valid) return json_({ success: false, error: 'Unauthorized.' });

    const currentPassword = String(e.parameter.currentPassword || '');
    const newPassword = String(e.parameter.newPassword || '');
    if (!currentPassword || !newPassword) {
      return json_({ success: false, error: 'Current and new password are both required.' });
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const iUsername = headers.indexOf('Username');
    const iHash = headers.indexOf('PasswordHash');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iUsername]).toLowerCase() === auth.username.toLowerCase()) {
        if (data[i][iHash] !== hashPassword_(currentPassword)) {
          return json_({ success: false, error: 'Current password is incorrect.' });
        }
        sheet.getRange(i + 1, iHash + 1).setValue(hashPassword_(newPassword));
        return json_({ success: true, message: 'Password changed successfully.' });
      }
    }
    return json_({ success: false, error: 'Profile not found.' });
  } finally {
    lock.releaseLock();
  }
}

// Lightweight in-sheet token check for the profile actions above —
// avoids a self-referential HTTP call back to this same script's own
// verifyToken endpoint.
function verifyTokenInline_(sheet, token) {
  if (!token) return { valid: false };
  const cleanToken = String(token).trim();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const iToken = headers.indexOf('Token');
  const iUsername = headers.indexOf('Username');
  for (let i = 1; i < data.length; i++) {
    // Sheet cells can carry invisible leading/trailing whitespace
    // even when they look identical — comparing as trimmed strings
    // (rather than strict ===, which is sensitive to that) avoids a
    // token that's genuinely correct being rejected over formatting.
    if (String(data[i][iToken]).trim() === cleanToken) {
      return { valid: true, username: data[i][iUsername] };
    }
  }
  return { valid: false };
}

// Saves a base64-encoded profile photo (already compressed client-
// side) into the dedicated Lalabella Profile Photos Drive folder —
// same pattern as Item Inventory's photo handling. Only the file ID
// is stored in the Sheet, keeping it light.
function saveProfilePhotoToDrive_(base64Data, username) {
  if (!base64Data) return '';
  const folder = DriveApp.getFolderById(PROFILE_PHOTOS_FOLDER_ID);
  const commaIdx = base64Data.indexOf(',');
  const cleanBase64 = commaIdx !== -1 ? base64Data.slice(commaIdx + 1) : base64Data;
  const bytes = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(bytes, 'image/jpeg', username + '.jpg');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

// Turns a stored profile PhotoLink (a bare Drive file ID) into a
// data: URI with the actual image bytes inline, ready to drop
// straight into an <img src="...">.
function profilePhotoToDataUri_(photoLink) {
  if (!photoLink) return '';
  try {
    const file = DriveApp.getFileById(String(photoLink).trim());
    const blob = file.getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return '';
  }
}

// ---------- Helpers ----------
function hashPassword_(password) {
  const pepper = PropertiesService.getScriptProperties().getProperty('PEPPER');
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + pepper);
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function generateToken_() {
  const raw = Utilities.getUuid() + Utilities.getUuid();
  return raw.replace(/-/g, '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run this ONE function manually (select it from the function
// dropdown at the top of the editor, then click Run) to trigger the
// "Authorization required" permission prompt for BOTH external
// requests (UrlFetchApp — used by verifyToken calls from other
// backends) AND Google Drive access (DriveApp — used to save/read
// profile photos). These are two SEPARATE permission scopes; running
// only a UrlFetchApp call before would authorize verifyToken calls
// but silently leave Drive photo saves failing.
function authorizeExternalRequests(){
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  DriveApp.getFolderById(PROFILE_PHOTOS_FOLDER_ID);
}
