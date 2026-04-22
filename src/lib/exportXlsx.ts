/**
 * Client-side XLSX export — Oto-Mod backend export stilini mirror eder.
 * (ExcelJS dynamic import; kullanıcı butona basmadan bundle'a inmez.)
 *
 * Kullanım yerleri:
 *  - Denetim > Kayıtlar (audit_log)
 *  - Oto-Mod "Log indir" (moderation_events)
 *  - Denetim > Analiz "Dışa aktar" (moderation_events)
 *
 * Ortak stil:
 *  - Başlık (A1:G1 merge, slate-900 banner)
 *  - Meta bloğu (Sunucu/Oluşturulma/Filtre/Toplam Kayıt)
 *  - Header row (slate-800, white bold)
 *  - Table rows: zebra (slate-50) + opsiyonel kind tint
 *  - Frozen header, AutoFilter
 */

export interface ExportColumn {
  key: string;           // Data key (row[key] ile çekilir)
  header: string;        // Kolon başlığı (insan okur)
  width: number;         // Excel kolon genişliği (wch)
  align?: 'left' | 'center' | 'right';
  /** Kind/türe göre tint için: row[key] değeri CELL_TINT'te varsa tint uygulanır */
  tintMap?: Record<string, { bg: string; fg: string }>;
  /** Muted gri görünüm (ID kolonları) */
  muted?: boolean;
  /** Date cell formatı */
  dateFormat?: string;
}

export interface ExportConfig {
  title: string;             // Örn: "Denetim Kayıtları Raporu"
  sheetName: string;         // Örn: "Denetim Kayıtları"
  tableName: string;         // Örn: "DenetimKayitlari" (no spaces)
  serverName: string;
  filterLabel: string;       // "Tüm kayıtlar" / "Aralık: 15.04 - 21.04"
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  filename: string;          // "denetim-kayitlari_2026-04-22.xlsx"
}

export async function downloadXlsx(cfg: ExportConfig): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MayVox';
  wb.created = new Date();

  const COLS = cfg.columns.length;
  const lastColLetter = String.fromCharCode(64 + COLS); // A=65 → 1st col
  const ws = wb.addWorksheet(cfg.sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.55, bottom: 0.55, header: 0.3, footer: 0.3 },
      printTitlesRow: '7:7',
    },
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  // Kolon genişlikleri
  ws.columns = cfg.columns.map(c => ({ width: c.width }));

  // ── Title (A1:last1) ──
  const TITLE_BG = 'FF0F172A';
  const TITLE_FG = 'FFFFFFFF';
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = cfg.title;
  titleCell.font = { bold: true, size: 15, color: { argb: TITLE_FG } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
  ws.getRow(1).height = 30;

  // ── Meta block (row 2-5) ──
  const fmtDate = (d: Date): string => d.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const metaPairs: Array<[string, string]> = [
    ['Sunucu',       cfg.serverName],
    ['Oluşturulma',  fmtDate(new Date())],
    ['Filtre',       cfg.filterLabel],
    ['Toplam Kayıt', String(cfg.rows.length)],
  ];
  const metaLabelFont = { bold: true, color: { argb: 'FF334155' }, size: 11 };
  const metaValueFont = { color: { argb: 'FF0F172A' }, size: 11 };
  metaPairs.forEach((pair, i) => {
    const rowNum = i + 2;
    const r = ws.getRow(rowNum);
    r.height = 18;
    const lbl = ws.getCell(`A${rowNum}`);
    lbl.value = pair[0];
    lbl.font = metaLabelFont;
    lbl.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.mergeCells(`B${rowNum}:${lastColLetter}${rowNum}`);
    const val = ws.getCell(`B${rowNum}`);
    val.value = pair[1];
    val.font = metaValueFont;
    val.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // Separator row 6
  const sepRow = ws.getRow(6);
  sepRow.height = 6;
  for (let col = 1; col <= COLS; col++) {
    sepRow.getCell(col).border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  }

  // ── Table (row 7 header, row 8+ data) ──
  const tableRows = cfg.rows.map(row => cfg.columns.map(c => {
    const v = row[c.key];
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'number') return v;
    return String(v);
  }));

  if (cfg.rows.length > 0) {
    ws.addTable({
      name: cfg.tableName,
      ref: 'A7',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: cfg.columns.map(c => ({ name: c.header })),
      rows: tableRows,
    });

    // Header row styling
    const HEADER_BG = 'FF1E293B';
    const HEADER_FG = 'FFFFFFFF';
    ws.getRow(7).height = 24;
    ws.getRow(7).eachCell((cell, col) => {
      if (col > COLS) return;
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.border = {
        top:    { style: 'thin',   color: { argb: 'FF475569' } },
        bottom: { style: 'medium', color: { argb: 'FF475569' } },
      };
      const colDef = cfg.columns[col - 1];
      if (colDef?.align === 'center' || colDef?.align === 'right') {
        cell.alignment = { vertical: 'middle', horizontal: colDef.align };
      }
    });

    // Data rows
    const ZEBRA_BG = 'FFF8FAFC';
    for (let i = 0; i < cfg.rows.length; i++) {
      const rowIdx = 8 + i;
      const r = ws.getRow(rowIdx);
      r.height = 20;
      cfg.columns.forEach((colDef, ci) => {
        const cell = r.getCell(ci + 1);
        const align = colDef.align ?? 'left';
        cell.alignment = {
          horizontal: align,
          vertical: 'middle',
          indent: align === 'left' ? 1 : 0,
        };
        const muted = colDef.muted;
        cell.font = muted
          ? { color: { argb: 'FF64748B' }, size: 10 }
          : { color: { argb: 'FF0F172A' }, size: 11 };

        // Tint map: kind/türe özel renkli cell
        const raw = cfg.rows[i][colDef.key];
        if (colDef.tintMap && typeof raw === 'string' && colDef.tintMap[raw]) {
          const t = colDef.tintMap[raw];
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t.bg } };
          cell.font = { bold: true, size: 11, color: { argb: t.fg } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        // Date format
        if (colDef.dateFormat && raw instanceof Date) {
          cell.numFmt = colDef.dateFormat;
          cell.alignment = { vertical: 'middle', horizontal: align === 'left' ? 'left' : align };
        }
      });

      // Zebra (alternate rows) — tint'li cell'leri ezme
      if (i % 2 === 1) {
        for (let col = 1; col <= COLS; col++) {
          const colDef = cfg.columns[col - 1];
          const raw = cfg.rows[i][colDef.key];
          if (colDef.tintMap && typeof raw === 'string' && colDef.tintMap[raw]) continue;
          const cell = r.getCell(col);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_BG } };
        }
      }
    }
  } else {
    // Empty state header
    ws.getRow(7).values = cfg.columns.map(c => c.header);
    ws.getRow(7).height = 24;
    ws.getRow(7).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });
    ws.mergeCells(`A8:${lastColLetter}8`);
    const emptyCell = ws.getCell('A8');
    emptyCell.value = 'Bu aralıkta kayıt bulunamadı';
    emptyCell.font = { italic: true, color: { argb: 'FF94A3B8' }, size: 11 };
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(8).height = 28;
  }

  // Browser download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cfg.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
