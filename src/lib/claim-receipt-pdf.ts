import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { Transaction, Product } from "@/data/mock-transactions";

export interface MatchedTransaction {
  txn: Transaction;
  matched: Product[];
}

// Words that carry no discriminative power when matching a product name against
// a lawsuit-registered product ("the Johnson's Baby Powder with 22 oz" vs
// "Johnson's Baby Powder Original" should still match on brand+category, not
// drown in filler tokens).
const MATCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "size", "pack", "count", "ct", "oz", "ml", "fl",
  "lb", "lbs", "kg", "pc", "pcs", "ea", "each", "new", "pro", "plus", "x",
  "ounce", "ounces", "gram", "grams", "liter", "litre", "liters", "litres",
  "inch", "inches", "bottle", "bottles", "spray", "jar", "tube", "box",
]);

function tokenize(input: string): Set<string> {
  const tokens = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && !MATCH_STOPWORDS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

/**
 * Match a transaction product against a lawsuit's registered product strings.
 *
 * Strategy, in order of increasing cost:
 *   1. Bidirectional substring match (cheapest; handles exact-match cases).
 *   2. Token-overlap: lower-case both sides, strip punctuation/units, then
 *      require ≥2 shared non-stopword tokens (or all needle tokens when the
 *      needle is <=2 tokens). This is what lets "Johnson's Baby Powder, 22 oz"
 *      match the lawsuit entry "Johnson's Baby Powder Original".
 */
export function findMatchedProducts(txn: Transaction, lawsuit: Lawsuit): Product[] {
  const needles = lawsuit.matchedProducts.map((p) => ({
    raw: p.toLowerCase(),
    tokens: tokenize(p),
  }));

  return txn.products.filter((product) => {
    const name = product.name.toLowerCase();
    const productTokens = tokenize(product.name);

    for (const needle of needles) {
      if (name.includes(needle.raw) || needle.raw.includes(name)) return true;

      if (needle.tokens.size === 0) continue;

      let overlap = 0;
      for (const t of needle.tokens) {
        if (productTokens.has(t)) overlap += 1;
      }

      const required = Math.min(2, needle.tokens.size);
      if (overlap >= required) return true;
    }

    return false;
  });
}

export function findMatchingTransactions(
  txns: Transaction[],
  lawsuit: Lawsuit
): MatchedTransaction[] {
  return txns
    .map((txn) => ({ txn, matched: findMatchedProducts(txn, lawsuit) }))
    .filter(({ matched }) => matched.length > 0);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function generateClaimReceiptPdf(
  txn: Transaction,
  matched: Product[],
  lawsuit: Lawsuit
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text("Digital Transaction Record", marginX, 64);

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.6);
  doc.line(marginX, 76, pageWidth - marginX, 76);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(`Transaction ID: ${txn.id}`, marginX, 96);

  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text("Merchant:", marginX, 120);
  doc.setFont("helvetica", "normal");
  doc.text(txn.merchant, marginX + 72, 120);

  doc.setFont("helvetica", "bold");
  doc.text("Transaction Date:", marginX, 138);
  doc.setFont("helvetica", "normal");
  doc.text(formatDate(txn.datetime), marginX + 108, 138);

  const calloutY = 158;
  const calloutHeight = 40 + matched.length * 16;
  doc.setFillColor(246, 241, 230);
  doc.setDrawColor(214, 196, 160);
  doc.roundedRect(marginX, calloutY, pageWidth - marginX * 2, calloutHeight, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(120, 90, 30);
  doc.text("ELIGIBLE ITEM - LAWSUIT REGISTRY", marginX + 12, calloutY + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 70, 30);
  doc.text(lawsuit.title, marginX + 12, calloutY + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  matched.forEach((product, idx) => {
    doc.text(
      `- ${product.name}  (ID: ${product.external_id})`,
      marginX + 12,
      calloutY + 48 + idx * 16
    );
  });

  const tableStartY = calloutY + calloutHeight + 24;

  autoTable(doc, {
    startY: tableStartY,
    head: [["Item Name", "External ID", "Unit Price", "Quantity"]],
    body: txn.products.map((p) => [
      p.name,
      p.external_id,
      formatCurrency(p.price.unit_price),
      String(p.quantity),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 8,
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [28, 28, 32],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
    },
    margin: { left: marginX, right: marginX },
  });

  const footerY = pageHeight - 48;
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, footerY - 14, pageWidth - marginX, footerY - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(
    "Verified via Knot API - Secure Transaction Record",
    pageWidth / 2,
    footerY,
    { align: "center" }
  );
  doc.setFontSize(8);
  doc.text(
    `Generated ${new Date().toLocaleString("en-US")}`,
    pageWidth / 2,
    footerY + 12,
    { align: "center" }
  );

  doc.save(`claim-receipt-${lawsuit.id}-${txn.id}.pdf`);
}
