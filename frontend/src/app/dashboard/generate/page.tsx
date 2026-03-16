"use client";

import React, { Suspense, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getToken, streamSSE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DocMeta {
  docId: string;
  title: string;
  issue: string;
  rev: string;
  date: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  department: string;
  transmittalNo: string;
}

interface PolicySection {
  id: string;
  number: string;
  title: string;
  content: string;
}

// ─── Markdown → Sections parser ───────────────────────────────────────────────
function parseToSections(markdown: string): PolicySection[] {
  const lines = markdown.split("\n");
  const sections: PolicySection[] = [];
  let current: PolicySection | null = null;
  let idx = 0;

  for (const line of lines) {
    // H2 with number: ## 1.0 Purpose
    const h2num = line.match(/^##\s+(\d+[\.\d]*)\s+(.+)/);
    // H2 without number: ## Purpose
    const h2plain = !h2num && line.match(/^##\s+(.+)/);
    // Bare number: 1.0 Purpose (not inside content)
    const bareNum = !h2num && !h2plain && line.match(/^(\d+\.\d*)\s{2,}(.+)/);

    if (h2num) {
      if (current) sections.push(current);
      current = { id: `s${idx++}`, number: h2num[1], title: h2num[2], content: "" };
    } else if (h2plain) {
      if (current) sections.push(current);
      current = { id: `s${idx++}`, number: `${idx}.0`, title: h2plain[1], content: "" };
    } else if (bareNum) {
      if (current) sections.push(current);
      current = { id: `s${idx++}`, number: bareNum[1], title: bareNum[2], content: "" };
    } else if (current) {
      // Skip the top-level title (first # line)
      if (line.startsWith("# ")) continue;
      current.content += line + "\n";
    }
  }
  if (current && (current.content.trim() || current.title)) sections.push(current);
  return sections;
}

// ─── Content renderer (for document viewer) ──────────────────────────────────
function renderContent(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  const inline = (s: string): React.ReactNode => {
    const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((p, k) => {
      if (p.startsWith("`") && p.endsWith("`")) return <code key={k} style={{ fontFamily: "var(--font-mono)", fontSize: "0.82em", padding: "1px 5px", borderRadius: 3, background: "rgba(16,217,160,0.08)", color: "var(--accent)" }}>{p.slice(1, -1)}</code>;
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={k}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*")) return <em key={k}>{p.slice(1, -1)}</em>;
      return p;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const sub = line.match(/^(###\s+)?(\d+\.\d+)\s+(.+)/);
    if (sub) {
      elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text-primary)", margin: "14px 0 6px", display: "flex", gap: 10 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", paddingTop: 1 }}>{sub[2]}</span><span>{inline(sub[3])}</span></div>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<div key={i} style={{ fontWeight: 600, fontSize: 12.5, color: "var(--accent)", margin: "10px 0 4px" }}>{inline(line.slice(4))}</div>);
      i++; continue;
    }
    if (line.match(/^[-*•] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*•] /)) { items.push(lines[i].replace(/^[-*•] /, "")); i++; }
      elements.push(<ul key={`ul${i}`} style={{ paddingLeft: 0, margin: "5px 0", listStyle: "none" }}>{items.map((item, j) => <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 4, fontSize: 12.5, lineHeight: 1.65, color: "var(--text-primary)" }}><span style={{ color: "var(--accent)", marginTop: 6, flexShrink: 0, fontSize: 6 }}>●</span><span>{inline(item)}</span></li>)}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      elements.push(<ol key={`ol${i}`} style={{ paddingLeft: 0, margin: "5px 0", listStyle: "none" }}>{items.map((item, j) => <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4, fontSize: 12.5, lineHeight: 1.65 }}><span style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 4, background: "rgba(16,217,160,0.08)", border: "1px solid rgba(16,217,160,0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent)", marginTop: 2 }}>{j + 1}</span><span style={{ color: "var(--text-primary)" }}>{inline(item)}</span></li>)}</ol>);
      continue;
    }
    if (line.trim() === "") { elements.push(<div key={i} style={{ height: 4 }} />); i++; continue; }
    if (line.match(/^---+$/)) { elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "7px 0" }} />); i++; continue; }
    elements.push(<p key={i} style={{ margin: "2px 0 4px", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-primary)" }}>{inline(line)}</p>);
    i++;
  }
  return elements;
}

// ─── Audit panel markdown renderer ───────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  const inline = (s: string): React.ReactNode => {
    const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((p, k) => {
      if (p.startsWith("`") && p.endsWith("`")) return <code key={k} style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", padding: "1px 5px", borderRadius: 4, background: "rgba(16,217,160,0.1)", color: "var(--accent)" }}>{p.slice(1, -1)}</code>;
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={k} style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*")) return <em key={k}>{p.slice(1, -1)}</em>;
      return p;
    });
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) { elements.push(<h1 key={i} style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "10px 0 5px" }}>{inline(line.slice(2))}</h1>); i++; continue; }
    if (line.startsWith("## ")) { elements.push(<h2 key={i} style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", margin: "9px 0 4px", borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>{inline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith("### ")) { elements.push(<h3 key={i} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent)", margin: "7px 0 3px" }}>{inline(line.slice(4))}</h3>); i++; continue; }
    if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(lines[i].slice(2)); i++; }
      elements.push(<ul key={`ul${i}`} style={{ paddingLeft: 0, margin: "4px 0", listStyle: "none" }}>{items.map((item, j) => <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 3, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-primary)" }}><span style={{ color: "var(--accent)", marginTop: 5, flexShrink: 0, fontSize: 7 }}>●</span><span>{inline(item)}</span></li>)}</ul>);
      continue;
    }
    if (line.trim() === "") { elements.push(<div key={i} style={{ height: 4 }} />); i++; continue; }
    elements.push(<p key={i} style={{ margin: "2px 0", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-primary)" }}>{inline(line)}</p>);
    i++;
  }
  return elements;
}

// ─── ASH HTML Export ──────────────────────────────────────────────────────────
function buildASHHtml(meta: DocMeta, sections: PolicySection[]): string {
  const totalPages = sections.length + 3;

  const sectionHtml = sections.map(sec => {
    const lines = sec.content.split("\n");
    let body = "";
    let ci = 0;
    while (ci < lines.length) {
      const line = lines[ci];
      const sub = line.match(/^(###\s+)?(\d+\.\d+)\s+(.+)/);
      if (sub) { body += `<div class="sub-head"><span class="sub-num">${sub[2]}</span>${sub[3]}</div>`; ci++; continue; }
      if (line.match(/^[-*•] /)) {
        body += "<ul>";
        while (ci < lines.length && lines[ci].match(/^[-*•] /)) { body += `<li>${lines[ci].replace(/^[-*•] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`; ci++; }
        body += "</ul>"; continue;
      }
      if (line.match(/^\d+\. /)) {
        body += "<ol>";
        while (ci < lines.length && lines[ci].match(/^\d+\. /)) { body += `<li>${lines[ci].replace(/^\d+\. /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`; ci++; }
        body += "</ol>"; continue;
      }
      if (line.trim() === "") { body += "<br>"; ci++; continue; }
      body += `<p>${line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")}</p>`;
      ci++;
    }
    return `<div class="pol-section"><div class="pol-sec-head"><span class="pol-sec-num">${sec.number}</span><span class="pol-sec-title">${sec.title}</span></div><div class="pol-sec-body">${body}</div></div>`;
  }).join("");

  const initials = (name: string) => name.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 4);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${meta.title} — Ali & Sons Holding LLC</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
:root{--em:#10d9a0;--gd:#f5a623;--font:'Sora',sans-serif;--mono:'JetBrains Mono',monospace;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:var(--font);background:#f0f4f8;color:#1e293b;font-size:13.5px;line-height:1.7;}
@media print{.no-print{display:none!important;}body{background:#fff;}.pg{break-after:page;}}
.no-print{position:fixed;top:20px;right:24px;z-index:100;display:flex;gap:8px;}
.btn-print{background:var(--em);color:#060e1c;border:none;border-radius:8px;padding:9px 18px;font-family:var(--font);font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(16,217,160,0.3);}
.btn-print:hover{transform:translateY(-1px);}

/* ── Page wrapper ── */
.pg{max-width:860px;margin:0 auto 32px;background:#fff;border:1px solid #dde4ee;position:relative;overflow:hidden;min-height:1050px;padding:40px 48px;}
.pg:last-child{margin-bottom:80px;}

/* ── Letterhead ── */
.lh{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #e2e8f0;margin-bottom:24px;}
.lh-addr{font-size:11.5px;color:#475569;line-height:1.8;}.lh-addr strong{color:#0f172a;font-size:12.5px;}
.lh-logo{text-align:right;}.lh-logo .name{font-family:var(--font);font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;}
.lh-logo .name em{color:var(--em);font-style:normal;}
.lh-logo .since{font-size:10px;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px;}

/* ── Approval page ── */
.appr-title{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;text-align:center;padding:18px;border-radius:8px;margin-bottom:22px;font-size:17px;font-weight:700;letter-spacing:0.02em;}
.appr-grid{width:100%;border-collapse:collapse;margin-bottom:16px;}
.appr-grid td{padding:9px 14px;border:1px solid #e2e8f0;font-size:12.5px;}
.appr-grid td:first-child{font-weight:600;background:#f8fafc;color:#475569;width:160px;}
.badge-appr{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10.5px;font-weight:700;background:rgba(16,217,160,0.08);color:var(--em);border:1px solid rgba(16,217,160,0.22);}
.appr-tbl{width:100%;border-collapse:collapse;}
.appr-tbl th{padding:9px 12px;background:#0f172a;color:#fff;font-size:11px;font-weight:600;text-align:left;}
.appr-tbl td{padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:top;}
.appr-tbl tr:nth-child(even) td{background:#f8fafc;}
.sig-line{display:inline-block;width:90px;border-bottom:1px solid #94a3b8;margin-bottom:3px;}

/* ── Controlled stamp ── */
.stamp{position:absolute;bottom:48px;right:48px;font-size:26px;font-weight:900;color:rgba(239,68,68,0.15);border:3px solid rgba(239,68,68,0.12);border-radius:8px;padding:5px 16px;transform:rotate(-15deg);letter-spacing:0.1em;pointer-events:none;}
.sys-footer{text-align:center;font-size:10.5px;color:#94a3b8;margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;}

/* ── Cover page ── */
.cover-title{text-align:center;font-size:32px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;margin:70px 0 54px;line-height:1.2;}
.cover-meta{width:100%;border-collapse:collapse;}
.cover-meta td{padding:10px 14px;border-top:1px solid #e2e8f0;font-size:12.5px;}
.cover-meta td:nth-child(odd){font-weight:600;color:#475569;width:200px;}
.cover-meta td:nth-child(even){color:#0f172a;}
.cover-footer{text-align:center;margin-top:36px;padding-top:18px;border-top:2px solid #e2e8f0;}
.cover-footer .cn{font-size:14px;font-weight:700;color:#0f172a;}
.cover-footer .ca{font-size:11px;color:#64748b;margin-top:4px;line-height:1.8;}

/* ── Running page header (rev history + content pages) ── */
.page-hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e2e8f0;margin-bottom:24px;}
.page-hdr-left{font-size:11px;line-height:1.8;color:#475569;}.page-hdr-left strong{color:#0f172a;font-size:12.5px;font-weight:700;}
.page-hdr-right{text-align:right;}

/* ── Revision history ── */
.rev-head{text-align:center;font-weight:700;font-size:14px;color:#0f172a;margin-bottom:18px;}
.rev-tbl{width:100%;border-collapse:collapse;}
.rev-tbl th{background:#0f172a;color:#fff;padding:9px 12px;font-size:11px;font-weight:600;text-align:left;}
.rev-tbl td{padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#334155;}
.rev-tbl tr:nth-child(even) td{background:#f8fafc;}
.sig-block{display:flex;justify-content:space-between;margin-top:44px;padding-top:18px;border-top:1px solid #e2e8f0;}
.sig-col{text-align:center;flex:1;}.sig-col .sl{width:90px;border-bottom:1px solid #0f172a;margin:0 auto 8px;height:22px;}
.sig-col .sn{font-size:12px;font-weight:600;color:#0f172a;}.sig-col .sr{font-size:10.5px;color:#64748b;margin-top:2px;}

/* ── Policy sections ── */
.pol-section{margin-bottom:26px;}
.pol-sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e2e8f0;}
.pol-sec-num{font-family:var(--mono);font-size:11.5px;font-weight:700;color:var(--em);min-width:30px;}
.pol-sec-title{font-size:14px;font-weight:700;color:#0f172a;}
.pol-sec-body{padding-left:18px;}
.pol-sec-body p{margin-bottom:7px;font-size:13px;line-height:1.7;color:#334155;}
.pol-sec-body ul{list-style:none;padding:0;margin:5px 0;}
.pol-sec-body ul li{display:flex;align-items:flex-start;gap:9px;margin-bottom:5px;font-size:13px;line-height:1.65;color:#334155;}
.pol-sec-body ul li::before{content:"●";color:var(--em);flex-shrink:0;margin-top:2px;font-size:8px;}
.pol-sec-body ol{padding-left:20px;margin:5px 0;}
.pol-sec-body ol li{margin-bottom:5px;font-size:13px;line-height:1.65;color:#334155;}
.sub-head{font-size:13px;font-weight:700;color:#0f172a;margin:14px 0 7px;}
.sub-num{font-family:var(--mono);font-size:11px;color:var(--em);margin-right:8px;}
.pol-sec-body br{display:block;height:3px;content:"";}
.end-sec{text-align:center;font-size:12px;font-weight:700;color:#64748b;margin-top:36px;padding:14px;border-top:2px solid #e2e8f0;border-bottom:2px solid #e2e8f0;letter-spacing:0.04em;}
</style></head><body>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">⎙ Print / Export PDF</button>
</div>

<!-- PAGE 1: Document Approval Status -->
<div class="pg">
  <div class="lh">
    <div class="lh-addr"><strong>Ali & Sons Holding LLC</strong><br>Zayed the 1st Street, P.O. Box 915<br>Abu Dhabi, United Arab Emirates<br>Phone: +971 2 672 3900 | Fax: +971 2 672 3901</div>
    <div class="lh-logo"><div class="name">Ali <em>&</em> Sons</div><div class="since">SINCE 1979</div></div>
  </div>
  <div class="appr-title">DOCUMENT APPROVAL STATUS</div>
  <table class="appr-grid">
    <tr><td>Company</td><td>Ali & Sons Holding LLC</td><td>Document Number</td><td><strong>${meta.docId}</strong></td></tr>
    <tr><td>Document Title</td><td colspan="3">${meta.title}</td></tr>
    <tr><td>Rev. No.</td><td>${meta.rev}</td><td>Issue. No.</td><td>${meta.issue}</td></tr>
    <tr><td>Document Type</td><td>POLICY</td><td>Department</td><td>${meta.department}</td></tr>
    <tr><td>Transmittal No.</td><td>${meta.transmittalNo}</td><td>Issue Date</td><td>${meta.date}</td></tr>
    <tr><td>Approval Status</td><td colspan="3"><span class="badge-appr">Approved</span></td></tr>
  </table>
  <table class="appr-tbl">
    <thead>
      <tr><th colspan="3">Approvers</th><th colspan="3">Reviewers</th></tr>
      <tr><th>Approver Name</th><th>Status</th><th>Signature / Date</th><th>Reviewer Name</th><th>Status</th><th>Signature / Date</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${meta.approvedBy}</strong><br><small style="color:#64748b">Group Managing Director</small></td>
        <td><span class="badge-appr">Approved</span></td>
        <td><span class="sig-line"></span><br><small style="color:#94a3b8;font-size:10px">${meta.date}</small></td>
        <td><strong>${meta.reviewedBy}</strong><br><small style="color:#64748b">Group Chief Information &amp; Digital Officer</small></td>
        <td><span class="badge-appr">Approved</span></td>
        <td><span class="sig-line"></span><br><small style="color:#94a3b8;font-size:10px">${meta.date}</small></td>
      </tr>
    </tbody>
  </table>
  <div class="stamp">CONTROLLED</div>
  <div class="sys-footer">This is system generated document no physical signature required</div>
</div>

<!-- PAGE 2: Cover Page -->
<div class="pg">
  <div class="lh">
    <div class="lh-addr"><strong>Ali & Sons Holding LLC</strong><br>Zayed the 1st Street, P.O. Box 915<br>Abu Dhabi, United Arab Emirates<br>Phone: +971 2 672 3900 | Fax: +971 2 672 3901</div>
    <div class="lh-logo"><div class="name">Ali <em>&</em> Sons</div><div class="since">SINCE 1979</div></div>
  </div>
  <div class="cover-title">${meta.title}</div>
  <table class="cover-meta">
    <tr><td>Prepared by:</td><td>${meta.preparedBy}</td><td>Document Status:</td><td>For Implementation</td></tr>
    <tr><td>Reviewed by:</td><td>${meta.reviewedBy}</td><td>Identification Number:</td><td><strong>${meta.docId}</strong></td></tr>
    <tr><td>Approved by:</td><td>${meta.approvedBy}</td><td>Issue:</td><td>${meta.issue}</td></tr>
    <tr><td>Responsible Department:</td><td>Information Technology</td><td>Revision:</td><td>${meta.rev}</td></tr>
    <tr><td>Format:</td><td>A4</td><td>Language:</td><td>English</td></tr>
    <tr><td>Date:</td><td>${meta.date}</td><td>Sheet:</td><td>1/${totalPages}</td></tr>
  </table>
  <div class="cover-footer">
    <div class="cn">علي وأولاده القابضة ذ.م.م. &nbsp;&nbsp; Ali &amp; Sons Holding LLC</div>
    <div class="ca">Zayed the 1st Street, PO Box 915, Abu Dhabi, U.A.E. | T: +971 2 6723900 | F: +971 2 6723901<br>www.ali-sons.com</div>
  </div>
  <div class="stamp">CONTROLLED</div>
</div>

<!-- PAGE 3: Revision History -->
<div class="pg">
  <div class="page-hdr">
    <div class="page-hdr-left"><strong>${meta.title}</strong><br>Ref: ${meta.docId}<br>Issue: ${meta.issue}<br>Rev: ${meta.rev}<br>Date: ${meta.date}<br>Page 2 of ${totalPages}</div>
    <div class="page-hdr-right"><div class="lh-logo"><div class="name">Ali <em>&</em> Sons</div><div class="since">SINCE 1979</div></div></div>
  </div>
  <div class="rev-head">Revision History</div>
  <table class="rev-tbl">
    <thead><tr><th>Issue</th><th>Revision</th><th>Date</th><th>Description</th><th>Prepared by</th><th>Reviewed by</th><th>Approved by</th></tr></thead>
    <tbody>
      <tr><td>${meta.issue}</td><td>00</td><td>${meta.date}</td><td>1st Issue</td><td>${initials(meta.preparedBy)}</td><td>${initials(meta.reviewedBy)}</td><td>${initials(meta.approvedBy)}</td></tr>
    </tbody>
  </table>
  <div class="sig-block">
    <div class="sig-col"><div class="sl"></div><div class="sn">${meta.preparedBy}</div><div class="sr">Prepared by</div></div>
    <div class="sig-col"><div class="sl"></div><div class="sn">${meta.reviewedBy}</div><div class="sr">Group Chief Information &amp; Digital Officer</div></div>
    <div class="sig-col"><div class="sl"></div><div class="sn">${meta.approvedBy}</div><div class="sr">Group Managing Director</div></div>
  </div>
  <div class="stamp">CONTROLLED</div>
</div>

<!-- PAGE 4+: Policy Content -->
<div class="pg">
  <div class="page-hdr">
    <div class="page-hdr-left"><strong>${meta.title}</strong><br>Ref: ${meta.docId}<br>Issue: ${meta.issue}<br>Rev: ${meta.rev}<br>Date: ${meta.date}</div>
    <div class="page-hdr-right"><div class="lh-logo"><div class="name">Ali <em>&</em> Sons</div><div class="since">SINCE 1979</div></div></div>
  </div>
  ${sectionHtml}
  <div class="end-sec">End of Section</div>
  <div class="stamp">CONTROLLED</div>
</div>

</body></html>`;
}

// ─── Section Editor Modal ─────────────────────────────────────────────────────
function SectionEditor({ section, onSave, onClose }: {
  section: PolicySection;
  onSave: (id: string, content: string, title: string) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(section.content);
  const [title, setTitle] = useState(section.title);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-emerald)", borderRadius: 12, width: "100%", maxWidth: 740, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "rgba(0,0,0,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)", background: "rgba(16,217,160,0.08)", border: "1px solid rgba(16,217,160,0.2)", padding: "2px 8px", borderRadius: 5 }}>{section.number}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ background: "transparent", border: "none", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, outline: "none", minWidth: 300 }} />
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 17 }}>✕</button>
        </div>
        <div style={{ padding: "8px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Use plain text or markdown. Sub-sections: </span>
          <code style={{ fontSize: 10, color: "var(--accent)", background: "rgba(16,217,160,0.06)", padding: "1px 6px", borderRadius: 3 }}>4.1 Sub-section Title</code>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}> · Bullets: </span>
          <code style={{ fontSize: 10, color: "var(--accent)", background: "rgba(16,217,160,0.06)", padding: "1px 6px", borderRadius: 3 }}>- item</code>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ flex: 1, resize: "none", background: "var(--bg-surface-2)", border: "none", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 12.5, padding: "16px 18px", outline: "none", lineHeight: 1.75, minHeight: 320 }}
          placeholder="Write section content..."
          autoFocus
        />
        <div style={{ padding: "11px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "7px 16px", fontSize: 12.5 }}>Cancel</button>
          <button onClick={() => { onSave(section.id, content, title); onClose(); }} className="btn-primary" style={{ padding: "7px 16px", fontSize: 12.5 }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function GenerateContent() {
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState(searchParams.get("q") ?? "");
  const [rawDraft, setRawDraft] = useState("");
  const [sections, setSections] = useState<PolicySection[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamPhase, setStreamPhase] = useState<"idle" | "researching" | "writing">("idle");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [streamingReview, setStreamingReview] = useState(false);
  const [genError, setGenError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [editingSection, setEditingSection] = useState<PolicySection | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [meta, setMeta] = useState<DocMeta>({
    docId: "ASH-IT-POL-026",
    title: "",
    issue: "01",
    rev: "00",
    date: new Date().toLocaleDateString("en-GB").replace(/\//g, "."),
    preparedBy: "Information Technology Department",
    reviewedBy: "Shumon A Zaman",
    approvedBy: "Shamis Al Dhaheri",
    department: "Information Technology",
    transmittalNo: `ASH-QHS-${new Date().getFullYear()}-00001`,
  });
  const previewRef = useRef<HTMLDivElement>(null);

  const setMetaField = (field: keyof DocMeta, val: string) =>
    setMeta(m => ({ ...m, [field]: val }));

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || streaming) return;
    setGenError("");
    setRawDraft("");
    setSections([]);
    setReviewFeedback("");
    setWordCount(0);
    setStreaming(true);
    setStreamPhase("researching");
    const token = getToken();
    let acc = "";
    streamSSE(
      "/api/admin/policies/generate/stream",
      { request: prompt.trim() },
      token,
      (chunk) => {
        if (streamPhase !== "writing") setStreamPhase("writing");
        acc += chunk;
        setRawDraft(acc);
        setWordCount(acc.trim().split(/\s+/).filter(Boolean).length);
      },
      () => {
        setStreaming(false);
        setStreamPhase("idle");
        const parsed = parseToSections(acc);
        setSections(parsed);
        const firstLine = acc.split("\n")[0].replace(/^#+\s*/, "").trim();
        if (firstLine) setMeta(m => ({ ...m, title: firstLine }));
        setTimeout(() => previewRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
      },
      (err) => { setStreaming(false); setStreamPhase("idle"); setGenError(err); }
    );
  }, [prompt, streaming]);

  const handleReview = () => {
    if (!rawDraft.trim() || streamingReview) return;
    setReviewError("");
    setReviewFeedback("");
    setStreamingReview(true);
    const token = getToken();
    let acc = "";
    streamSSE(
      "/api/admin/policies/review/stream",
      { policy_text: rawDraft },
      token,
      (chunk) => { acc += chunk; setReviewFeedback(acc); },
      () => setStreamingReview(false),
      (err) => { setStreamingReview(false); setReviewError(err); }
    );
  };

  const updateSection = useCallback((id: string, content: string, title: string) => {
    setSections(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, content, title } : s);
      const rebuilt = updated.map(s => `## ${s.number} ${s.title}\n${s.content}`).join("\n");
      setRawDraft(rebuilt);
      setWordCount(rebuilt.trim().split(/\s+/).filter(Boolean).length);
      return updated;
    });
  }, []);

  const handleExportHTML = () => {
    if (!sections.length) return;
    const finalMeta = { ...meta, title: meta.title || sections[0]?.title || "IT Policy" };
    const html = buildASHHtml(finalMeta, sections);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.docId}_${(finalMeta.title).replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 60)}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportBackend = async (type: "docx" | "pdf") => {
    if (!rawDraft.trim()) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/admin/policies/export/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ policy_text: rawDraft }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Export failed" })); alert(e.detail || "Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${meta.docId}.${type}`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { alert(`Export error: ${e}`); }
  };

  const hasDraft = sections.length > 0 || rawDraft.length > 0;
  const draftTitle = meta.title || sections[0]?.title || "IT Policy Document";

  return (
    <>
      {editingSection && (
        <SectionEditor section={editingSection} onSave={updateSection} onClose={() => setEditingSection(null)} />
      )}
      <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
        {/* ── Header ── */}
        <div style={{ flexShrink: 0, padding: "13px 22px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 16.5, fontWeight: 700, background: "linear-gradient(135deg, var(--accent), var(--gold))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 1 }}>Policy Generator</h1>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Generates ASH-format policy documents · ISO 27001 · UAE NESA · PDPL compliant</p>
          </div>
          {hasDraft && !streaming && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={handleExportHTML} className="btn-primary" style={{ padding: "6px 14px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export ASH HTML
              </button>
              <button onClick={() => handleExportBackend("docx")} className="btn-ghost" style={{ padding: "6px 12px", fontSize: 11.5 }}>DOCX</button>
              <button onClick={() => handleExportBackend("pdf")} className="btn-ghost" style={{ padding: "6px 12px", fontSize: 11.5 }}>PDF</button>
            </div>
          )}
        </div>

        {/* ── Two-column body ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>

          {/* LEFT — Prompt + Meta + Document */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--border)" }}>

            {/* Prompt */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <label style={{ display: "block", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 7 }}>Policy Request</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                placeholder="e.g. 'Draft a BYOD policy for Ali & Sons covering NESA controls and UAE PDPL requirements'"
                rows={3}
                style={{ width: "100%", resize: "none", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 12.5, padding: "8px 12px", outline: "none", marginBottom: 9, boxSizing: "border-box", lineHeight: 1.6 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,217,160,0.09)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {genError && <p style={{ fontSize: 11.5, color: "var(--danger)", marginBottom: 8 }}>{genError}</p>}
              <button onClick={handleGenerate} disabled={streaming || !prompt.trim()} className="btn-primary" style={{ width: "100%", padding: "9px 16px", fontSize: 12.5 }}>
                {streaming ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <span className="spinner" style={{ width: 13, height: 13 }} />Generating Policy...
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Generate ASH Policy
                  </span>
                )}
              </button>
            </div>

            {/* Document Metadata (collapsible) */}
            <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <button onClick={() => setShowMeta(!showMeta)} style={{ width: "100%", padding: "8px 18px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Document Metadata</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--accent)", background: "rgba(16,217,160,0.07)", border: "1px solid rgba(16,217,160,0.15)", padding: "1px 7px", borderRadius: 4 }}>{meta.docId}</span>
                </div>
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--text-muted)", transform: showMeta ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showMeta && (
                <div style={{ padding: "4px 18px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 10px" }}>
                  {([
                    ["Document ID", "docId"],
                    ["Issue No.", "issue"],
                    ["Revision No.", "rev"],
                    ["Date (DD.MM.YYYY)", "date"],
                    ["Prepared By", "preparedBy"],
                    ["Reviewed By", "reviewedBy"],
                    ["Approved By", "approvedBy"],
                    ["Department", "department"],
                    ["Transmittal No.", "transmittalNo"],
                  ] as [string, keyof DocMeta][]).map(([label, field]) => (
                    <div key={field} style={field === "preparedBy" || field === "reviewedBy" || field === "approvedBy" || field === "transmittalNo" ? { gridColumn: "span 2" } : {}}>
                      <label style={{ display: "block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 3 }}>{label}</label>
                      <input
                        value={meta[field] as string}
                        onChange={(e) => setMetaField(field, e.target.value)}
                        style={{ width: "100%", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 11.5, padding: "5px 9px", outline: "none", boxSizing: "border-box" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document viewer */}
            <div ref={previewRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {!hasDraft && !streaming ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--text-muted)", padding: 36, textAlign: "center" }}>
                  <svg width="52" height="52" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8} style={{ opacity: 0.15 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>Generated policy will appear here<br />in <strong style={{ color: "var(--accent)" }}>ASH document format</strong></p>
                  <p style={{ fontSize: 10.5, color: "var(--text-ghost)" }}>Document Approval Status · Cover Page · Revision History · Numbered Sections 1.0–7.0</p>
                </div>
              ) : streaming && sections.length === 0 ? (
                <div style={{ padding: "20px 18px" }}>
                  {/* Phase indicator */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "9px 14px", background: streamPhase === "researching" ? "rgba(245,166,35,0.06)" : "rgba(16,217,160,0.05)", border: `1px solid ${streamPhase === "researching" ? "rgba(245,166,35,0.2)" : "rgba(16,217,160,0.12)"}`, borderRadius: 7 }}>
                    {streamPhase === "researching" ? (
                      <>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[0, 0.15, 0.3].map((d, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)", animation: `pulse-dot 1s ease-in-out ${d}s infinite`, display: "inline-block" }} />)}
                        </div>
                        <span style={{ fontSize: 11.5, color: "var(--gold)", fontWeight: 600 }}>Researching regulatory context...</span>
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: "auto" }}>RAG + Web search</span>
                      </>
                    ) : (
                      <>
                        <span className="status-dot online" style={{ width: 7, height: 7 }} />
                        <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>Writing policy...</span>
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: "auto" }}>{wordCount.toLocaleString()} words</span>
                      </>
                    )}
                  </div>
                  {rawDraft && (
                    <pre style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {rawDraft}<span className="cursor-blink">▋</span>
                    </pre>
                  )}
                </div>
              ) : (
                <div style={{ padding: "14px 14px 24px" }}>
                  {/* ── Approval Status Card ── */}
                  <div style={{ borderRadius: 8, border: "1px solid var(--border-emerald)", overflow: "hidden", marginBottom: 12, background: "var(--bg-surface)" }}>
                    <div style={{ background: "linear-gradient(135deg, rgba(16,217,160,0.07), rgba(16,217,160,0.02))", borderBottom: "1px solid var(--border-emerald)", padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--accent)" }}>Document Approval Status</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "rgba(16,217,160,0.08)", border: "1px solid rgba(16,217,160,0.2)", padding: "2px 8px", borderRadius: 4 }}>APPROVED · CONTROLLED</span>
                    </div>
                    <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                      {[["Company", "Ali & Sons Holding LLC"], ["Document Number", meta.docId], ["Document Title", draftTitle], ["Document Type", "POLICY"], ["Rev. No.", meta.rev], ["Issue. No.", meta.issue], ["Department", meta.department], ["Issue Date", meta.date]].map(([k, v]) => (
                        <div key={k} style={{ display: "flex", gap: 5 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 88, flexShrink: 0 }}>{k}:</span>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", padding: "9px 14px", display: "flex", gap: 24 }}>
                      {[["Prepared by", meta.preparedBy], ["Reviewed by", meta.reviewedBy], ["Approved by", meta.approvedBy]].map(([role, name]) => (
                        <div key={role}>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{role}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Sections ── */}
                  {sections.map((sec) => (
                    <div key={sec.id} style={{ marginBottom: 10, borderRadius: 7, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-surface)" }}>
                      <div style={{ padding: "9px 13px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.18)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          {sec.number && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(16,217,160,0.07)", border: "1px solid rgba(16,217,160,0.14)", padding: "2px 7px", borderRadius: 4 }}>{sec.number}</span>}
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{sec.title}</span>
                        </div>
                        <button onClick={() => setEditingSection(sec)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 10px", color: "var(--text-muted)", cursor: "pointer", fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Edit
                        </button>
                      </div>
                      <div style={{ padding: "11px 14px" }}>
                        {sec.content.trim() ? renderContent(sec.content) : (
                          <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontStyle: "italic" }}>{streaming ? "Writing..." : "Empty — click Edit to add content."}</p>
                        )}
                        {streaming && sections[sections.length - 1]?.id === sec.id && <span className="cursor-blink" />}
                      </div>
                    </div>
                  ))}

                  {!streaming && sections.length > 0 && (
                    <div style={{ textAlign: "center", padding: "10px 0", marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>— End of Section —</span>
                    </div>
                  )}

                  {/* Run audit + word count */}
                  {hasDraft && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{wordCount.toLocaleString()} words · {sections.length} sections</span>
                      {!streaming && (
                        <button onClick={handleReview} disabled={streamingReview} className="btn-gold" style={{ padding: "5px 14px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}>
                          {streamingReview ? <><span className="spinner" style={{ width: 11, height: 11 }} />Reviewing...</> : <><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Run Compliance Audit</>}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Compliance Auditor */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: "var(--gold)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Compliance Auditor</div>
                <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                  {["NESA", "ISO 27001", "UAE PDPL", "NIST CSF", "COBIT 5"].map((b) => (
                    <span key={b} className="badge badge-gold" style={{ fontSize: 9, padding: "1px 6px" }}>{b}</span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {reviewError && <div style={{ padding: "10px 18px", fontSize: 12, color: "var(--danger)" }}>{reviewError}</div>}
              {!reviewFeedback && !streamingReview && !hasDraft ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--text-muted)", padding: 36, textAlign: "center" }}>
                  <svg width="50" height="50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8} style={{ opacity: 0.18 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>Generate a policy draft first,<br />then run <strong style={{ color: "var(--gold)" }}>Compliance Audit</strong><br />to check UAE NESA, ISO 27001 &amp; PDPL.</p>
                </div>
              ) : !reviewFeedback && streamingReview ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  <div style={{ display: "flex", gap: 6 }}>{[0, 0.15, 0.3].map((d, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--gold)", animation: `pulse-dot 1s ease-in-out ${d}s infinite`, display: "inline-block" }} />)}</div>
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Running compliance checks...</p>
                </div>
              ) : !reviewFeedback && hasDraft ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 36, textAlign: "center" }}>
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} style={{ opacity: 0.28, color: "var(--gold)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>Policy draft ready.<br />Click <strong style={{ color: "var(--gold)" }}>Run Compliance Audit</strong> to check.</p>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
                  {renderMarkdown(reviewFeedback)}
                  {streamingReview && <span className="cursor-blink" />}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><span className="spinner" style={{ width: 20, height: 20 }} /></div>}>
      <GenerateContent />
    </Suspense>
  );
}
