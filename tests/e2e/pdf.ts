export function pdfFixture(
  options: { pages?: number; scanned?: boolean; links?: boolean } = {},
): Buffer {
  const count = options.pages ?? 2,
    font = 3 + count * 2,
    objects: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${count} >>`,
    ];
  for (let i = 0; i < count; i++) {
    const number = 3 + i * 2,
      height = i % 2 === 0 ? 400 : 450;
    const annotations =
      options.links && i === 0
        ? ` /Annots [${font + 1} 0 R ${font + 2} 0 R ${font + 3} 0 R]`
        : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${number + 1} 0 R${annotations} >>`,
    );
    const stream = options.scanned
      ? "0.5 g 30 300 200 50 re f"
      : `BT /F1 16 Tf 30 350 Td (PDF page ${i + 1} research) Tj ET`;
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  if (options.links)
    objects.push(
      "<< /Type /Annot /Subtype /Link /Rect [30 280 170 305] /Border [0 0 0] /A << /S /URI /URI (https://example.org/research) >> >>",
      "<< /Type /Annot /Subtype /Link /Rect [30 245 170 270] /Border [0 0 0] /A << /S /URI /URI (javascript:alert\\(1\\)) >> >>",
      `<< /Type /Annot /Subtype /Link /Rect [30 210 170 235] /Border [0 0 0] /Dest [${3 + (count - 1) * 2} 0 R /Fit] >>`,
    );
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
