// Netlify Function: submissions (CommonJS) â€” stores ONLY incompleteList
const { google } = require('googleapis');

const SHEET_RANGE = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:H';   // header A1:H1
const SHEET_GET_RANGE = process.env.GOOGLE_SHEETS_GET_RANGE || 'Sheet1!A2:H'; // skip header

exports.handler = async (event) => {
  // CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  try {
    const sheets = await getSheetsClient();

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      const required = ['date','housekeeper','shift','totalTasks','completionRate','submittedAt','incompleteTasks'];
      for (const key of required) {
        if (body[key] === undefined || body[key] === null || body[key] === '') {
          return json({ error: `Missing field: ${key}` }, 400);
        }
      }

      const incompleteList = (body.incompleteTasks || []).join('; ');
      const completedCount = Math.max(0, (body.completedTasks || []).length); // derive if provided

      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: SHEET_RANGE,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            body.date,
            body.housekeeper,
            body.shift,
            completedCount,           // D
            body.totalTasks,          // E
            `${body.completionRate}%`,// F
            new Date(body.submittedAt).toLocaleString(), // G
            incompleteList            // H
          ]]
        }
      });

      return json({ ok: true });
    }

    if (event.httpMethod === 'GET') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: SHEET_GET_RANGE
      });

      const rows = (res.data && res.data.values) ? res.data.values : [];
      const submissions = rows.map((r) => ({
        date: r[0] || '',
        housekeeper: r[1] || '',
        shift: r[2] || '',
        completedCount: Number(r[3] || 0),
        totalTasks: Number(r[4] || 0),
        completionRate: String(r[5] || '').replace('%',''),
        submittedAt: r[6] || '',
        incompleteList: r[7] || ''
      }));

      return json({ submissions });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*', // set to your domain once deployed
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(data)
  };
}

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}
