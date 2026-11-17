/* Shared calendar + phone helpers for Pia Nora Inkart (browser + Node). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PNI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var KALENDER_PATH = "/kalender/";
  var TZID = "Europe/Berlin";

  var VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "X-LIC-LOCATION:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ].join("\n");

  function pad(n) { return String(n).padStart(2, "0"); }

  function parseHours(raw) {
    if (raw == null || raw === "") return 3;
    var n = parseFloat(String(raw).replace(",", "."));
    if (!isFinite(n) || n <= 0) return 3;
    return n;
  }

  function formatHours(h) {
    var n = parseHours(h);
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 10) / 10).replace(".", ",");
  }

  function parseDateTime(dateStr, timeStr) {
    var dParts = String(dateStr || "").split("-");
    var tParts = String(timeStr || "").split(":");
    if (dParts.length < 3 || tParts.length < 2) return null;
    var y = +dParts[0], mo = +dParts[1], d = +dParts[2];
    var hh = +tParts[0], mm = +tParts[1];
    if (![y, mo, d, hh, mm].every(function (x) { return isFinite(x); })) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return new Date(y, mo - 1, d, hh, mm, 0);
  }

  function addHours(date, hours) {
    return new Date(date.getTime() + parseHours(hours) * 3600000);
  }

  function fmtLocalICS(date) {
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "T" +
      pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  }

  function fmtUTCStamp(date) {
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + "T" +
      pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + "Z";
  }

  function fmtDE(dateStr, longMonth) {
    var p = String(dateStr || "").split("-");
    if (p.length < 3) return dateStr || "";
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    if (isNaN(dt.getTime())) return dateStr;
    var day = WOCHENTAGE[dt.getDay()];
    if (longMonth) return day + ", " + pad(dt.getDate()) + ". " + MONATE[dt.getMonth()] + " " + dt.getFullYear();
    return day + ", " + pad(dt.getDate()) + "." + pad(dt.getMonth() + 1) + "." + dt.getFullYear();
  }

  function fmtTime(timeStr) {
    var t = String(timeStr || "");
    var m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t;
    return pad(+m[1]) + ":" + m[2];
  }

  function escapeText(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\n|\r/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function foldIcs(text) {
    var encoder = new TextEncoder();
    var decoder = new TextDecoder("utf-8");
    var lines = String(text).split(/\r?\n/);
    var out = [];
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var bytes = encoder.encode(line);
      if (bytes.length <= 75) {
        out.push(line);
        continue;
      }
      var i = 0, first = true;
      while (i < bytes.length) {
        var budget = first ? 75 : 74;
        var take = Math.min(budget, bytes.length - i);
        while (take > 1 && (bytes[i + take] & 0xC0) === 0x80) take--;
        var chunk = decoder.decode(bytes.slice(i, i + take));
        out.push(first ? chunk : " " + chunk);
        i += take;
        first = false;
      }
    }
    return out.join("\r\n") + "\r\n";
  }

  function slug(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "termin";
  }

  function stableUid(opts) {
    var base = [opts.date, fmtTime(opts.time).replace(":", ""), slug(opts.name), slug(opts.motiv || "tattoo")].join("-");
    return "termin-" + base + "@pia-nora-inkart.github.io";
  }

  function descriptionLines(opts, forClient) {
    var lines = [];
    if (forClient) {
      lines.push("Tattoo-Termin bei Pia Nora Inkart");
      if (opts.motiv) lines.push("Motiv: " + opts.motiv);
      if (opts.duration) lines.push("Dauer: ca. " + formatHours(opts.duration) + " Std.");
      lines.push("Absage bitte bis 48 h vorher.");
    } else {
      if (opts.name) lines.push("Kunde: " + opts.name);
      if (opts.phoneDisplay || opts.phone) lines.push("Telefon: " + (opts.phoneDisplay || opts.phone));
      if (opts.motiv) lines.push("Motiv: " + opts.motiv);
      if (opts.deposit) lines.push("Anzahlung: " + opts.deposit + " €");
      if (opts.note) lines.push("Notiz: " + opts.note);
    }
    return lines.join("\n");
  }

  function buildIcs(opts) {
    opts = opts || {};
    var start = parseDateTime(opts.date, opts.time);
    if (!start) throw new Error("Ungültiges Datum oder Uhrzeit");
    var end = addHours(start, opts.duration);
    var summary = opts.summary || (
      opts.forClient
        ? "Tattoo-Termin bei Pia Nora Inkart"
        : ("Tattoo: " + (opts.name || "Klient") + (opts.motiv ? " – " + opts.motiv : ""))
    );
    var desc = opts.description != null ? opts.description : descriptionLines(opts, !!opts.forClient);
    var uid = opts.uid || stableUid(opts);
    var now = opts.now || new Date();
    var alarmTitle = opts.forClient
      ? "Tattoo-Termin bei Pia Nora Inkart"
      : ("Tattoo: " + (opts.name || ""));
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pia Nora Inkart//Termin//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      VTIMEZONE,
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + fmtUTCStamp(now),
      "DTSTART;TZID=" + TZID + ":" + fmtLocalICS(start),
      "DTEND;TZID=" + TZID + ":" + fmtLocalICS(end),
      "SUMMARY:" + escapeText(summary),
      "DESCRIPTION:" + escapeText(desc),
      "LOCATION:" + escapeText(opts.location || "Pia Nora Inkart"),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-P1D",
      "DESCRIPTION:" + escapeText("Morgen: " + alarmTitle),
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT2H",
      "DESCRIPTION:" + escapeText("In 2 Stunden: " + alarmTitle),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return foldIcs(lines.join("\n"));
  }

  function icsFilename(opts) {
    return "tattoo-" + slug(opts && opts.name) + "-" + (opts && opts.date || "termin") + ".ics";
  }

  function isIOS() {
    if (typeof navigator === "undefined") return false;
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function openIcs(ics, filename) {
    if (typeof document === "undefined") return ics;
    var blob = new Blob([ics], { type: "text/calendar" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "termin.ics";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, isIOS() ? 30000 : 4000);
    return url;
  }

  function normalizePhone(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    s = s.replace(/[^\d+]/g, "");
    if (s.indexOf("00") === 0) s = s.slice(2);
    else if (s.charAt(0) === "+") s = s.slice(1);
    s = s.replace(/\D/g, "");
    if (!s) return "";
    if (s.charAt(0) === "0") s = "49" + s.slice(1);
    else if (s.indexOf("49") !== 0 && /^1[5-7]\d{7,11}$/.test(s)) s = "49" + s;
    return s;
  }

  function formatPhoneDisplay(raw) {
    var s = normalizePhone(raw);
    if (!s) return "";
    if (s.indexOf("49") === 0) {
      var nat = s.slice(2);
      if (/^1[5-7]/.test(nat) && nat.length >= 9) return "+49 " + nat.slice(0, 3) + " " + nat.slice(3);
      return "+49 " + nat;
    }
    return "+" + s;
  }

  function kalenderUrl(opts, origin) {
    var base;
    if (origin) base = String(origin).replace(/\/$/, "") + KALENDER_PATH;
    else if (typeof location !== "undefined") base = location.origin + KALENDER_PATH;
    else base = "https://pia-nora-inkart.github.io/kalender/";
    var q = [];
    function add(k, v) {
      if (v == null || String(v).trim() === "") return;
      q.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v).trim()));
    }
    add("n", opts.name);
    add("d", opts.date);
    add("t", fmtTime(opts.time));
    add("h", formatHours(opts.duration).replace(",", "."));
    add("m", opts.motiv);
    return base + "?" + q.join("&");
  }

  function googleCalUrl(opts) {
    var start = parseDateTime(opts.date, opts.time);
    if (!start) return "";
    var end = addHours(start, opts.duration);
    function g(d) {
      return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    }
    var text = opts.summary || "Tattoo-Termin bei Pia Nora Inkart";
    var details = opts.description != null ? opts.description : descriptionLines(opts, true);
    var u = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(text) +
      "&dates=" + g(start) + "/" + g(end) +
      "&ctz=" + encodeURIComponent(TZID) +
      "&location=" + encodeURIComponent(opts.location || "Pia Nora Inkart") +
      "&details=" + encodeURIComponent(details);
    return u;
  }

  function waConfirmText(opts) {
    var name = (opts.name || "").trim() || "du";
    var hours = formatHours(opts.duration);
    var lines = [
      "Hey " + name + "! Hier ist Pianora von Pia Nora Inkart 🖤 Dein Termin ist bestätigt:",
      "",
      "📅 " + fmtDE(opts.date, false),
      "🕒 " + fmtTime(opts.time) + " Uhr (ca. " + hours + " Std).",
      ""
    ];
    var dep = String(opts.deposit || "").trim().replace(".", ",");
    if (dep) {
      lines.push("Damit der Termin fix ist, überweise bitte die Anzahlung von " + dep + " € (50 %).");
      lines.push("");
    }
    lines.push("Absage bitte bis 48 h vorher.");
    lines.push("");
    lines.push("Termin in deinen Kalender speichern:");
    lines.push(kalenderUrl(opts, opts.origin));
    lines.push("");
    lines.push("Ich freu mich auf dich!");
    return lines.join("\n");
  }

  function waSendHref(phone, text) {
    var base = "https://api.whatsapp.com/send";
    var q = [];
    var num = normalizePhone(phone);
    if (num) q.push("phone=" + num);
    if (text) q.push("text=" + encodeURIComponent(text));
    return q.length ? base + "?" + q.join("&") : base;
  }

  function isLabelLine(line) {
    return /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*)?(Name|WhatsApp(?:\s*\/\s*Telefon)?|Idee\s*\/\s*Motiv|Motiv|Körperstelle|Größe|Stil|Erstes Tattoo|Wunschtermin(?:\s*\/\s*Zeitraum)?|Budgetrahmen)\s*:?\s*$/iu.test(String(line).trim()) ||
      /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*)?(Name|WhatsApp(?:\s*\/\s*Telefon)?|Idee\s*\/\s*Motiv|Motiv|Körperstelle|Größe|Stil|Erstes Tattoo|Wunschtermin(?:\s*\/\s*Zeitraum)?|Budgetrahmen)\s*:/iu.test(String(line).trim());
  }

  function labelKey(line) {
    var s = String(line).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, "").trim();
    if (/^Name\b/i.test(s)) return "name";
    if (/^WhatsApp/i.test(s)) return "phone";
    if (/^(Idee\s*\/\s*)?Motiv\b/i.test(s)) return "motiv";
    if (/^Körperstelle\b/i.test(s)) return "stelle";
    if (/^Größe\b/i.test(s)) return "groesse";
    if (/^Stil\b/i.test(s)) return "stil";
    if (/^Erstes Tattoo\b/i.test(s)) return "erstes";
    if (/^Wunschtermin\b/i.test(s)) return "zeitraum";
    if (/^Budgetrahmen\b/i.test(s)) return "budget";
    return null;
  }

  function splitLabelValue(line) {
    var s = String(line).trim();
    var m = s.match(/:\s*(.*)$/);
    if (!m) return { label: s, value: "" };
    var after = m[1].trim();
    if (after === "—" || after === "-") after = "";
    return { label: s, value: after };
  }

  function parseGermanDate(s) {
    var m = String(s || "").match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (!m) return "";
    var d = pad(+m[1]), mo = pad(+m[2]), y = m[3];
    if (y.length === 2) y = "20" + y;
    return y + "-" + mo + "-" + d;
  }

  function parseRequest(text) {
    var raw = String(text || "").replace(/\r\n/g, "\n").trim();
    var out = { name: "", phone: "", motiv: "", stelle: "", groesse: "", stil: "", erstes: "", zeitraum: "", budget: "", date: "", note: "" };
    if (!raw) return out;
    var lines = raw.split("\n");
    var i = 0;
    while (i < lines.length) {
      var line = lines[i].trim();
      var key = labelKey(line);
      if (!key) { i++; continue; }
      var sv = splitLabelValue(line);
      var vals = [];
      if (sv.value) vals.push(sv.value);
      i++;
      while (i < lines.length) {
        var nxt = lines[i];
        var t = nxt.trim();
        if (!t) {
          if (i + 1 < lines.length && labelKey(lines[i + 1])) break;
          if (vals.length) break;
          i++;
          continue;
        }
        if (labelKey(t) || /^✅/.test(t) || /^Hi Pianora/i.test(t)) break;
        if (/^Konkretes Datum:/i.test(t)) {
          var ds = parseGermanDate(t);
          if (ds) out.date = ds;
          var rest = t.replace(/^Konkretes Datum:\s*/i, "").trim();
          if (rest) vals.push(t.trim());
          i++;
          continue;
        }
        vals.push(t);
        i++;
      }
      var joined = vals.join("\n").replace(/^\s*[—-]\s*$/gm, "").trim();
      if (key === "zeitraum") {
        var pd = parseGermanDate(joined);
        if (pd) out.date = pd;
      }
      if (out[key] != null && key !== "date") out[key] = joined;
    }
    var extras = [];
    if (out.stelle) extras.push("Körperstelle: " + out.stelle);
    if (out.groesse) extras.push("Größe: " + out.groesse);
    if (out.stil) extras.push("Stil: " + out.stil);
    if (out.erstes) extras.push("Erstes Tattoo: " + out.erstes);
    if (out.zeitraum) extras.push("Wunschtermin: " + out.zeitraum.replace(/\n/g, ", "));
    if (out.budget) extras.push("Budget: " + out.budget);
    out.note = extras.join("\n");
    return out;
  }

  return {
    WOCHENTAGE: WOCHENTAGE,
    MONATE: MONATE,
    parseHours: parseHours,
    formatHours: formatHours,
    parseDateTime: parseDateTime,
    addHours: addHours,
    fmtDE: fmtDE,
    fmtTime: fmtTime,
    fmtLocalICS: fmtLocalICS,
    buildIcs: buildIcs,
    icsFilename: icsFilename,
    openIcs: openIcs,
    isIOS: isIOS,
    normalizePhone: normalizePhone,
    formatPhoneDisplay: formatPhoneDisplay,
    kalenderUrl: kalenderUrl,
    googleCalUrl: googleCalUrl,
    waConfirmText: waConfirmText,
    waSendHref: waSendHref,
    parseRequest: parseRequest,
    descriptionLines: descriptionLines
  };
});
