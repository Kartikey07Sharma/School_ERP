const AppError = require("./AppError");

function invalidCsv(message = "CSV file is malformed") {
  return new AppError(message, 400, "INVALID_CSV");
}

function parseCsvBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw invalidCsv("CSV file is empty");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw invalidCsv("CSV file must use valid UTF-8 encoding");
  }
  if (text.includes("\0") || /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw invalidCsv("CSV file contains unsupported binary characters");
  }

  const records = [];
  let row = [];
  let field = "";
  let state = "unquoted";
  let line = 1;
  let rowNumber = 1;
  let rowHasDelimiter = false;

  const pushField = () => {
    row.push(field);
    field = "";
    state = "unquoted";
  };
  const pushRecord = () => {
    pushField();
    const isBlankLine = row.length === 1 && row[0] === "" && !rowHasDelimiter;
    if (!isBlankLine) records.push({ rowNumber, values: row });
    row = [];
    rowHasDelimiter = false;
    rowNumber = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const isNewline = char === "\n" || char === "\r";
    const newlineWidth = char === "\r" && text[index + 1] === "\n" ? 2 : 1;

    if (state === "quoted") {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          state = "closed";
        }
      } else if (isNewline) {
        field += "\n";
        line += 1;
        if (newlineWidth === 2) index += 1;
      } else {
        field += char;
      }
      continue;
    }

    if (state === "closed") {
      if (char === ",") {
        pushField();
        rowHasDelimiter = true;
      } else if (isNewline) {
        pushRecord();
        line += 1;
        if (newlineWidth === 2) index += 1;
      } else {
        throw invalidCsv(`Unexpected character after closing quote at CSV row ${rowNumber}`);
      }
      continue;
    }

    if (char === '"') {
      if (field.length !== 0) throw invalidCsv(`Unexpected quote in unquoted field at CSV row ${rowNumber}`);
      state = "quoted";
    } else if (char === ",") {
      pushField();
      rowHasDelimiter = true;
    } else if (isNewline) {
      pushRecord();
      line += 1;
      if (newlineWidth === 2) index += 1;
    } else {
      field += char;
    }
  }

  if (state === "quoted") throw invalidCsv(`Unclosed quoted field starting before CSV row ${rowNumber}`);
  if (field.length > 0 || row.length > 0 || rowHasDelimiter || state === "closed") {
    pushRecord();
  }
  return records;
}

module.exports = { parseCsvBuffer };
