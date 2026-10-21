'use client'
export default function PrintButton() {
  return <button className="btn btn-primary print:hidden" onClick={() => window.print()}>Cetak atau simpan PDF</button>
}
