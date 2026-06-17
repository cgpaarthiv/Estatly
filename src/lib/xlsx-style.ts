import * as XLSX from "xlsx-js-style";

const TITLE_BG = "166532";  // green
const HEADER_BG = "FFFF00"; // yellow

const DARK_BORDER = {
  top:    { style: "medium", color: { rgb: "000000" } },
  bottom: { style: "medium", color: { rgb: "000000" } },
  left:   { style: "medium", color: { rgb: "000000" } },
  right:  { style: "medium", color: { rgb: "000000" } },
};

const THIN_BORDER = {
  top:    { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left:   { style: "thin", color: { rgb: "000000" } },
  right:  { style: "thin", color: { rgb: "000000" } },
};

export function styleSheet(
  ws: XLSX.WorkSheet,
  titleRow?: { text: string },
) {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const headerRow = titleRow ? 1 : 0;

  if (titleRow) {
    const cols = range.e.c + 1;
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols - 1 } }];
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: TITLE_BG } },
        font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center" },
        border: DARK_BORDER,
      };
    }
  }

  // Header row — yellow with dark borders
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: HEADER_BG } },
        font: { bold: true, color: { rgb: "000000" } },
        border: DARK_BORDER,
      };
    }
  }

  // Data rows — thin borders on every cell
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: "z", v: "" };
      ws[addr].s = { ...(ws[addr].s ?? {}), border: THIN_BORDER };
    }
  }

  // Check if last row contains "Total" label and format/merge it
  let isTotalRow = false;
  for (let c = range.s.c; c <= Math.min(range.e.c, 4); c++) {
    const addr = XLSX.utils.encode_cell({ r: range.e.r, c });
    if (ws[addr]?.v === "Total") {
      isTotalRow = true;
      break;
    }
  }

  if (isTotalRow) {
    const totalRowIndex = range.e.r;
    const mergeStartCol = 0;
    const mergeEndCol = range.e.c - 1;

    // Merge columns 0 to range.e.c - 1 in the total row
    ws["!merges"] = ws["!merges"] || [];
    ws["!merges"].push({
      s: { r: totalRowIndex, c: mergeStartCol },
      e: { r: totalRowIndex, c: mergeEndCol },
    });

    // Overwrite all merged cells to be yellow and have a dark border
    for (let c = mergeStartCol; c <= mergeEndCol; c++) {
      const addr = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      ws[addr] = {
        t: "s",
        v: c === mergeStartCol ? "Total" : "",
        s: {
          fill: { fgColor: { rgb: HEADER_BG } }, // Yellow
          font: { bold: true, color: { rgb: "000000" } },
          alignment: { horizontal: "right" },
          border: DARK_BORDER,
        },
      };
    }

    // Style the actual total amount cell with bold font and dark border
    const amountCellAddr = XLSX.utils.encode_cell({ r: totalRowIndex, c: range.e.c });
    if (ws[amountCellAddr]) {
      ws[amountCellAddr].s = {
        ...(ws[amountCellAddr].s ?? {}),
        font: { bold: true, color: { rgb: "000000" } },
        border: DARK_BORDER,
      };
    }
  }
}

export function styledSheet(
  data: object[],
  title?: string,
): XLSX.WorkSheet {
  if (title) {
    const ws = XLSX.utils.aoa_to_sheet([[title]]);
    XLSX.utils.sheet_add_json(ws, data, { origin: "A2" });
    styleSheet(ws, { text: title });
    return ws;
  }
  const ws = XLSX.utils.json_to_sheet(data);
  styleSheet(ws);
  return ws;
}
