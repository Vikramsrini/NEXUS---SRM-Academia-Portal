// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Calendar Parser
// Handles the actual SRM Academic Planner HTML format
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';

/**
 * Generates calendar URLs to try, current semester first.
 */
export function getCalendarUrls() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const base = 'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/Academic_Planner_';
  const urls = [];

  const currentAcYear = month >= 7 ? year : year - 1;
  const nextYear2Digit = String(currentAcYear + 1).slice(-2);
  const yearStr = `${currentAcYear}_${nextYear2Digit}`;

  if (month >= 1 && month <= 6) {
    urls.push(`${base}${yearStr}_EVEN`);
    urls.push(`${base}${yearStr}_ODD`);
  } else {
    urls.push(`${base}${yearStr}_ODD`);
    urls.push(`${base}${yearStr}_EVEN`);
  }

  return urls;
}

export function getCalendarDynamicUrl() {
  return getCalendarUrls()[0];
}

/**
 * Decodes HTML entities that SRM uses in zmlvalue attributes.
 * Handles &#xHH; hex entities, &amp;, &lt;, &gt;, &quot;, &#39; etc.
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Parses the academic calendar from the raw page response.
 *
 * SRM format:
 * - Response is HTML with a div.zc-pb-embed-placeholder-content[zmlvalue="..."]
 * - zmlvalue contains HTML-entity-encoded HTML with a <table>
 * - Table has 5 columns per month: Dt, Day, Event(month header), DO, separator
 * - Months like "Jan '26", "Feb '26" etc.
 */
export function parseSrmCalendar(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { error: 'Empty calendar response', status: 500 };
  }

  // Reject login pages
  if (rawResponse.includes('Academic Web Services Login') && !rawResponse.includes('Academic_Planner')) {
    return { error: 'Got login page instead of calendar', status: 401 };
  }

  // Step 1: Extract zmlvalue from the outer HTML
  let calendarHtml = '';

  // Strategy A: zmlvalue attribute (the actual SRM format)
  const zmlMatch = rawResponse.match(/zmlvalue="([^"]*)"/s);
  if (zmlMatch?.[1]) {
    calendarHtml = decodeHtmlEntities(zmlMatch[1]);
    console.log('[Calendar] Decoded zmlvalue, length:', calendarHtml.length);
  }

  // Strategy B: Cheerio-based extraction
  if (!calendarHtml) {
    const $outer = cheerio.load(rawResponse, { decodeEntities: true });
    const zmlAttr = $outer('div.zc-pb-embed-placeholder-content').attr('zmlvalue');
    if (zmlAttr) {
      calendarHtml = zmlAttr;
      console.log('[Calendar] Cheerio zmlvalue, length:', calendarHtml.length);
    }
  }

  // Strategy C: pageSanitizer wrapper
  if (!calendarHtml) {
    const sanitizeMatch = rawResponse.match(/pageSanitizer\.sanitize\('(.*)'\);/s);
    if (sanitizeMatch?.[1]) {
      calendarHtml = sanitizeMatch[1]
        .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\\\/g, '')
        .replace(/\\'/g, "'");
    }
  }

  // Strategy D: raw response is the HTML itself
  if (!calendarHtml) {
    calendarHtml = rawResponse;
  }

  const $ = cheerio.load(calendarHtml, { decodeEntities: true });

  // Find the calendar table — try multiple selectors
  let $table = $("table[bgcolor='#FAFCFE']");
  if (!$table.length) $table = $("table[bgcolor='#fafcfe']");
  if (!$table.length) {
    // SRM 2025-26 format: table with border-color style, near the Academic Planner heading
    $('table').each((_, tbl) => {
      const $t = $(tbl);
      // Check if this table has month-like headers (Jan, Feb, Mar, etc.)
      const headerText = $t.find('th').text().toLowerCase();
      if (headerText.includes("jan") || headerText.includes("jul") ||
          headerText.includes("feb") || headerText.includes("aug")) {
        $table = $t;
        return false;
      }
    });
  }

  if (!$table.length) {
    console.error('[Calendar] No table found. Tables on page:', $('table').length);
    console.error('[Calendar] First 500 chars:', calendarHtml.substring(0, 500));
    return { error: 'Could not find calendar table', status: 500 };
  }

  // Step 2: Parse month headers from <th> elements
  const $ths = $table.find('th');
  const months = [];
  const monthShortNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthFullNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Scan ALL <th> elements to find month names
  $ths.each((i, th) => {
    const text = $(th).text().trim().replace(/\s+/g, ' ');
    // Match patterns like "Jan '26", "Feb '26", "January", "JANUARY 2026"
    for (let mi = 0; mi < monthShortNames.length; mi++) {
      if (text.toLowerCase().startsWith(monthShortNames[mi])) {
        months.push({
          rawHeader: text,
          monthIdx: mi,
          fullName: monthFullNames[mi],
          label: text, // e.g. "Jan '26"
          thIndex: i,
          days: [],
        });
        break;
      }
    }
  });

  if (months.length === 0) {
    return { error: 'No month headers found in calendar table', status: 500 };
  }

  console.log('[Calendar] Found months:', months.map(m => m.label).join(', '));

  // Step 3: Determine column positions for each month
  // SRM layout: 5 columns per month [Dt, Day, Event, DO, blank_separator]
  // Headers: [DtDay, MonthName, DO, blank, Dt, Day, MonthName, DO, blank, ...]
  // Data row: 5 cells per month
  const COLS_PER_MONTH = 5;

  // Step 4: Parse data rows
  const $rows = $table.find('tr');
  const dataRows = $rows.toArray().filter(row => {
    // Skip header row (contains <th>)
    return $(row).find('th').length === 0 && $(row).find('td').length >= COLS_PER_MONTH;
  });

  console.log('[Calendar] Data rows:', dataRows.length);

  dataRows.forEach(row => {
    const $tds = $(row).find('td');
    const cellCount = $tds.length;

    months.forEach((month, mi) => {
      const offset = mi * COLS_PER_MONTH;
      if (offset + 3 >= cellCount) return;

      const dateText = $tds.eq(offset).text().trim();
      if (!dateText || dateText === '-') return;

      const dateNum = parseInt(dateText);
      if (isNaN(dateNum) || dateNum < 1 || dateNum > 31) return;

      const dayText = $tds.eq(offset + 1).text().trim();
      const eventCell = $tds.eq(offset + 2);
      // Get event text: try <strong>/<b> first, then plain text
      let eventText = eventCell.find('strong, b, span[style*="color"]').text().trim();
      if (!eventText) eventText = eventCell.text().trim();
      
      const doText = $tds.eq(offset + 3).text().trim();

      month.days.push({
        date: String(dateNum),
        day: dayText,
        event: (eventText === '-' || eventText === '' || eventText === '\u00a0') ? '' : eventText,
        dayOrder: (doText === '-' || doText === '' || doText === '\u00a0') ? '' : doText,
      });
    });
  });

  // Build year from header text
  const yearMatch = months[0]?.label.match(/'(\d{2})/) || months[0]?.label.match(/(\d{4})/);
  const yearStr = yearMatch ? (yearMatch[1].length === 2 ? '20' + yearMatch[1] : yearMatch[1]) : String(new Date().getFullYear());

  // Format output
  const calendar = months.map(m => ({
    month: `${m.fullName} ${yearStr}`,
    days: m.days,
  }));

  const totalDays = calendar.reduce((s, m) => s + m.days.length, 0);
  console.log(`[Calendar] Parsed ${calendar.length} months, ${totalDays} days total`);

  return { calendar, status: 200 };
}
