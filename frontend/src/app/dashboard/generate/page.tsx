"use client";

import React, { Suspense, useRef, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getToken, streamSSE, apiFetch, apiUpload } from "@/lib/api";

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

// Flow: configure → generating (auto: draft → audit) → review (comment loop) → export
type WizardStep = "configure" | "generating" | "review" | "export";

const STEP_LABELS: Record<WizardStep, { num: number; label: string }> = {
  configure: { num: 1, label: "Configure" },
  generating: { num: 2, label: "Generating" },
  review: { num: 3, label: "Review & Approve" },
  export: { num: 4, label: "Export Report" },
};

const POLICY_TYPES = [
  "Access Control Policy",
  "Anti-Virus and Patch Management Policy",
  "Acceptable Use Policy",
  "AI Tools Usage Policy",
  "BYOD (Bring Your Own Device) Policy",
  "Cloud Security Policy",
  "Data Backup and Restoration Policy",
  "Data Classification Policy",
  "Data Management Policy",
  "Disaster Recovery Plan Policy",
  "Email Usage Policy",
  "Incident Management Policy",
  "Information Security Policy",
  "IT Risk Management Policy",
  "Logging and Monitoring Policy",
  "Network Security Policy",
  "Password and Authentication Policy",
  "Removable Media Policy",
  "Server Administration Policy",
  "Social Media Policy",
  "Third-Party Vendor Security Policy",
  "Custom Policy (specify below)",
];

const FRAMEWORKS = [
  { id: "nesa", label: "UAE NESA", desc: "National Electronic Security Authority" },
  { id: "iso27001", label: "ISO 27001:2022", desc: "Information Security Management" },
  { id: "pdpl", label: "UAE PDPL", desc: "Personal Data Protection Law" },
  { id: "nist", label: "NIST CSF 2.0", desc: "Cybersecurity Framework" },
  { id: "cis", label: "CIS Controls v8", desc: "Center for Internet Security" },
  { id: "adda", label: "ADDA", desc: "Abu Dhabi Digital Authority" },
];

type AutoPhase = "idle" | "researching" | "writing" | "auditing" | "done";

// ─── Markdown → Sections parser ───────────────────────────────────────────────
function parseToSections(markdown: string): PolicySection[] {
  const lines = markdown.split("\n");
  const sections: PolicySection[] = [];
  let current: PolicySection | null = null;
  let idx = 0;
  for (const line of lines) {
    const h2num = line.match(/^##\s+(\d+[\.\d]*)\s+(.+)/);
    const h2plain = !h2num && line.match(/^##\s+(.+)/);
    const bareNum = !h2num && !h2plain && line.match(/^(\d+\.\d*)\s{2,}(.+)/);
    if (h2num) { if (current) sections.push(current); current = { id: `s${idx++}`, number: h2num[1], title: h2num[2], content: "" }; }
    else if (h2plain) { if (current) sections.push(current); current = { id: `s${idx++}`, number: `${idx}.0`, title: h2plain[1], content: "" }; }
    else if (bareNum) { if (current) sections.push(current); current = { id: `s${idx++}`, number: bareNum[1], title: bareNum[2], content: "" }; }
    else if (current) { current.content += line + "\n"; }
  }
  if (current && (current.content.trim() || current.title)) sections.push(current);
  return sections;
}

// ─── Inline markdown renderer ─────────────────────────────────────────────────
const inlineMd = (s: string): React.ReactNode => {
  const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, k) => {
    if (p.startsWith("`") && p.endsWith("`")) return <code key={k} style={{ fontFamily: "var(--font-mono)", fontSize: "0.82em", padding: "1px 5px", borderRadius: 3, background: "rgba(16,217,160,0.08)", color: "var(--accent)" }}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={k}>{p.slice(1, -1)}</em>;
    return p;
  });
};

// ─── Section content renderer ─────────────────────────────────────────────────
function renderContent(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const sub = line.match(/^(###\s+)?(\d+\.\d+)\s+(.+)/);
    if (sub) { elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text-primary)", margin: "14px 0 6px", display: "flex", gap: 10 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", paddingTop: 1 }}>{sub[2]}</span><span>{inlineMd(sub[3])}</span></div>); i++; continue; }
    if (line.startsWith("### ")) { elements.push(<div key={i} style={{ fontWeight: 600, fontSize: 12.5, color: "var(--accent)", margin: "10px 0 4px" }}>{inlineMd(line.slice(4))}</div>); i++; continue; }
    if (line.match(/^[-*] /)) { const items: string[] = []; while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(lines[i].replace(/^[-*] /, "")); i++; } elements.push(<ul key={`ul${i}`} style={{ paddingLeft: 0, margin: "5px 0", listStyle: "none" }}>{items.map((it, j) => <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 4, fontSize: 12.5, lineHeight: 1.65, color: "var(--text-primary)" }}><span style={{ color: "var(--accent)", marginTop: 6, flexShrink: 0, fontSize: 6 }}>&#9679;</span><span>{inlineMd(it)}</span></li>)}</ul>); continue; }
    if (line.match(/^\d+\. /)) { const items: string[] = []; while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, "")); i++; } elements.push(<ol key={`ol${i}`} style={{ paddingLeft: 0, margin: "5px 0", listStyle: "none" }}>{items.map((it, j) => <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4, fontSize: 12.5, lineHeight: 1.65 }}><span style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 4, background: "rgba(16,217,160,0.08)", border: "1px solid rgba(16,217,160,0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent)", marginTop: 2 }}>{j + 1}</span><span style={{ color: "var(--text-primary)" }}>{inlineMd(it)}</span></li>)}</ol>); continue; }
    if (line.trim() === "") { elements.push(<div key={i} style={{ height: 4 }} />); i++; continue; }
    if (line.match(/^---+$/)) { elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "7px 0" }} />); i++; continue; }
    elements.push(<p key={i} style={{ margin: "2px 0 4px", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-primary)" }}>{inlineMd(line)}</p>); i++;
  }
  return elements;
}

// ─── Audit markdown renderer ──────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) { elements.push(<h1 key={i} style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "10px 0 5px" }}>{inlineMd(line.slice(2))}</h1>); i++; continue; }
    if (line.startsWith("## ")) { elements.push(<h2 key={i} style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", margin: "9px 0 4px", borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>{inlineMd(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith("### ")) { elements.push(<h3 key={i} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent)", margin: "7px 0 3px" }}>{inlineMd(line.slice(4))}</h3>); i++; continue; }
    if (line.match(/^[-*] /)) { const items: string[] = []; while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(lines[i].slice(2)); i++; } elements.push(<ul key={`ul${i}`} style={{ paddingLeft: 0, margin: "4px 0", listStyle: "none" }}>{items.map((it, j) => <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 3, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-primary)" }}><span style={{ color: "var(--accent)", marginTop: 5, flexShrink: 0, fontSize: 7 }}>&#9679;</span><span>{inlineMd(it)}</span></li>)}</ul>); continue; }
    if (line.trim() === "") { elements.push(<div key={i} style={{ height: 4 }} />); i++; continue; }
    elements.push(<p key={i} style={{ margin: "2px 0", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-primary)" }}>{inlineMd(line)}</p>); i++;
  }
  return elements;
}

// ─── ASH HTML Export (unchanged from before) ──────────────────────────────────
function buildASHHtml(meta: DocMeta, sections: PolicySection[]): string {
  const totalPages = sections.length + 3;
  const sectionHtml = sections.map(sec => {
    const lines = sec.content.split("\n"); let body = ""; let ci = 0;
    while (ci < lines.length) { const line = lines[ci]; const sub = line.match(/^(###\s+)?(\d+\.\d+)\s+(.+)/); if (sub) { body += `<div class="sub-head"><span class="sub-num">${sub[2]}</span>${sub[3]}</div>`; ci++; continue; } if (line.match(/^[-*] /)) { body += "<ul>"; while (ci < lines.length && lines[ci].match(/^[-*] /)) { body += `<li>${lines[ci].replace(/^[-*] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`; ci++; } body += "</ul>"; continue; } if (line.match(/^\d+\. /)) { body += "<ol>"; while (ci < lines.length && lines[ci].match(/^\d+\. /)) { body += `<li>${lines[ci].replace(/^\d+\. /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`; ci++; } body += "</ol>"; continue; } if (line.trim() === "") { body += "<br>"; ci++; continue; } body += `<p>${line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")}</p>`; ci++; }
    return `<div class="pol-section"><div class="pol-sec-head"><span class="pol-sec-num">${sec.number}</span><span class="pol-sec-title">${sec.title}</span></div><div class="pol-sec-body">${body}</div></div>`;
  }).join("");
  const initials = (name: string) => name.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 4);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${meta.title} — Ali & Sons Holding LLC</title><style>@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');:root{--em:#10d9a0;--gd:#f5a623;--font:'Sora',sans-serif;--mono:'JetBrains Mono',monospace;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:var(--font);background:#f0f4f8;color:#1e293b;font-size:13.5px;line-height:1.7;}@media print{.no-print{display:none!important;}body{background:#fff;}.pg{break-after:page;}}.no-print{position:fixed;top:20px;right:24px;z-index:100;display:flex;gap:8px;}.btn-print{background:var(--em);color:#060e1c;border:none;border-radius:8px;padding:9px 18px;font-family:var(--font);font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(16,217,160,0.3);}.pg{max-width:860px;margin:0 auto 32px;background:#fff;border:1px solid #dde4ee;position:relative;overflow:hidden;min-height:1050px;padding:40px 48px;}.lh{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #e2e8f0;margin-bottom:24px;}.lh-addr{font-size:11.5px;color:#475569;line-height:1.8;}.lh-addr strong{color:#0f172a;font-size:12.5px;}.lh-logo{text-align:right;}.lh-logo .name{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;}.lh-logo .name em{color:var(--em);font-style:normal;}.lh-logo .since{font-size:10px;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px;}.appr-title{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;text-align:center;padding:18px;border-radius:8px;margin-bottom:22px;font-size:17px;font-weight:700;}.appr-grid{width:100%;border-collapse:collapse;margin-bottom:16px;}.appr-grid td{padding:9px 14px;border:1px solid #e2e8f0;font-size:12.5px;}.appr-grid td:first-child{font-weight:600;background:#f8fafc;color:#475569;width:160px;}.badge-appr{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10.5px;font-weight:700;background:rgba(16,217,160,0.08);color:var(--em);border:1px solid rgba(16,217,160,0.22);}.appr-tbl{width:100%;border-collapse:collapse;}.appr-tbl th{padding:9px 12px;background:#0f172a;color:#fff;font-size:11px;font-weight:600;text-align:left;}.appr-tbl td{padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:top;}.sig-line{display:inline-block;width:90px;border-bottom:1px solid #94a3b8;margin-bottom:3px;}.stamp{position:absolute;bottom:48px;right:48px;font-size:26px;font-weight:900;color:rgba(239,68,68,0.15);border:3px solid rgba(239,68,68,0.12);border-radius:8px;padding:5px 16px;transform:rotate(-15deg);letter-spacing:0.1em;pointer-events:none;}.sys-footer{text-align:center;font-size:10.5px;color:#94a3b8;margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;}.cover-title{text-align:center;font-size:32px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;margin:70px 0 54px;line-height:1.2;}.cover-meta{width:100%;border-collapse:collapse;}.cover-meta td{padding:10px 14px;border-top:1px solid #e2e8f0;font-size:12.5px;}.cover-meta td:nth-child(odd){font-weight:600;color:#475569;width:200px;}.cover-footer{text-align:center;margin-top:36px;padding-top:18px;border-top:2px solid #e2e8f0;}.cover-footer .cn{font-size:14px;font-weight:700;color:#0f172a;}.cover-footer .ca{font-size:11px;color:#64748b;margin-top:4px;line-height:1.8;}.page-hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e2e8f0;margin-bottom:24px;}.page-hdr-left{font-size:11px;line-height:1.8;color:#475569;}.page-hdr-left strong{color:#0f172a;font-size:12.5px;font-weight:700;}.rev-head{text-align:center;font-weight:700;font-size:14px;color:#0f172a;margin-bottom:18px;}.rev-tbl{width:100%;border-collapse:collapse;}.rev-tbl th{background:#0f172a;color:#fff;padding:9px 12px;font-size:11px;font-weight:600;text-align:left;}.rev-tbl td{padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#334155;}.sig-block{display:flex;justify-content:space-between;margin-top:44px;padding-top:18px;border-top:1px solid #e2e8f0;}.sig-col{text-align:center;flex:1;}.sig-col .sl{width:90px;border-bottom:1px solid #0f172a;margin:0 auto 8px;height:22px;}.sig-col .sn{font-size:12px;font-weight:600;color:#0f172a;}.sig-col .sr{font-size:10.5px;color:#64748b;margin-top:2px;}.pol-section{margin-bottom:26px;}.pol-sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e2e8f0;}.pol-sec-num{font-family:var(--mono);font-size:11.5px;font-weight:700;color:var(--em);min-width:30px;}.pol-sec-title{font-size:14px;font-weight:700;color:#0f172a;}.pol-sec-body{padding-left:18px;}.pol-sec-body p{margin-bottom:7px;font-size:13px;line-height:1.7;color:#334155;}.pol-sec-body ul{list-style:none;padding:0;margin:5px 0;}.pol-sec-body ul li{display:flex;align-items:flex-start;gap:9px;margin-bottom:5px;font-size:13px;line-height:1.65;color:#334155;}.pol-sec-body ul li::before{content:"\\25CF";color:var(--em);flex-shrink:0;margin-top:2px;font-size:8px;}.pol-sec-body ol{padding-left:20px;margin:5px 0;}.pol-sec-body ol li{margin-bottom:5px;font-size:13px;line-height:1.65;color:#334155;}.sub-head{font-size:13px;font-weight:700;color:#0f172a;margin:14px 0 7px;}.sub-num{font-family:var(--mono);font-size:11px;color:var(--em);margin-right:8px;}.end-sec{text-align:center;font-size:12px;font-weight:700;color:#64748b;margin-top:36px;padding:14px;border-top:2px solid #e2e8f0;border-bottom:2px solid #e2e8f0;letter-spacing:0.04em;}</style></head><body><div class="no-print"><button class="btn-print" onclick="window.print()">Print / Export PDF</button></div><div class="pg"><div class="lh"><div class="lh-addr"><strong>Ali & Sons Holding LLC</strong><br>Zayed the 1st Street, P.O. Box 915<br>Abu Dhabi, UAE<br>T: +971 2 672 3900</div><div class="lh-logo"><div class="name">Ali <em>&amp;</em> Sons</div><div class="since">SINCE 1979</div></div></div><div class="appr-title">DOCUMENT APPROVAL STATUS</div><table class="appr-grid"><tr><td>Company</td><td>Ali & Sons Holding LLC</td><td>Document Number</td><td><strong>${meta.docId}</strong></td></tr><tr><td>Document Title</td><td colspan="3">${meta.title}</td></tr><tr><td>Rev. No.</td><td>${meta.rev}</td><td>Issue. No.</td><td>${meta.issue}</td></tr><tr><td>Document Type</td><td>POLICY</td><td>Department</td><td>${meta.department}</td></tr><tr><td>Transmittal No.</td><td>${meta.transmittalNo}</td><td>Issue Date</td><td>${meta.date}</td></tr><tr><td>Approval Status</td><td colspan="3"><span class="badge-appr">Approved</span></td></tr></table><table class="appr-tbl"><thead><tr><th>Approver Name</th><th>Status</th><th>Signature / Date</th><th>Reviewer Name</th><th>Status</th><th>Signature / Date</th></tr></thead><tbody><tr><td><strong>${meta.approvedBy}</strong></td><td><span class="badge-appr">Approved</span></td><td><span class="sig-line"></span><br><small>${meta.date}</small></td><td><strong>${meta.reviewedBy}</strong></td><td><span class="badge-appr">Approved</span></td><td><span class="sig-line"></span><br><small>${meta.date}</small></td></tr></tbody></table><div class="stamp">CONTROLLED</div><div class="sys-footer">This is system generated document no physical signature required</div></div><div class="pg"><div class="lh"><div class="lh-addr"><strong>Ali & Sons Holding LLC</strong><br>Zayed the 1st Street, P.O. Box 915<br>Abu Dhabi, UAE</div><div class="lh-logo"><div class="name">Ali <em>&amp;</em> Sons</div><div class="since">SINCE 1979</div></div></div><div class="cover-title">${meta.title}</div><table class="cover-meta"><tr><td>Prepared by:</td><td>${meta.preparedBy}</td><td>Document Status:</td><td>For Implementation</td></tr><tr><td>Reviewed by:</td><td>${meta.reviewedBy}</td><td>Identification Number:</td><td><strong>${meta.docId}</strong></td></tr><tr><td>Approved by:</td><td>${meta.approvedBy}</td><td>Issue:</td><td>${meta.issue}</td></tr><tr><td>Responsible Department:</td><td>Information Technology</td><td>Revision:</td><td>${meta.rev}</td></tr><tr><td>Date:</td><td>${meta.date}</td><td>Sheet:</td><td>1/${totalPages}</td></tr></table><div class="cover-footer"><div class="cn">Ali &amp; Sons Holding LLC</div><div class="ca">Zayed the 1st Street, PO Box 915, Abu Dhabi, U.A.E. | T: +971 2 6723900</div></div><div class="stamp">CONTROLLED</div></div><div class="pg"><div class="page-hdr"><div class="page-hdr-left"><strong>${meta.title}</strong><br>Ref: ${meta.docId} | Issue: ${meta.issue} | Rev: ${meta.rev} | Date: ${meta.date}</div></div><div class="rev-head">Revision History</div><table class="rev-tbl"><thead><tr><th>Issue</th><th>Rev</th><th>Date</th><th>Description</th><th>Prepared</th><th>Reviewed</th><th>Approved</th></tr></thead><tbody><tr><td>${meta.issue}</td><td>00</td><td>${meta.date}</td><td>1st Issue</td><td>${initials(meta.preparedBy)}</td><td>${initials(meta.reviewedBy)}</td><td>${initials(meta.approvedBy)}</td></tr></tbody></table><div class="sig-block"><div class="sig-col"><div class="sl"></div><div class="sn">${meta.preparedBy}</div><div class="sr">Prepared by</div></div><div class="sig-col"><div class="sl"></div><div class="sn">${meta.reviewedBy}</div><div class="sr">Reviewed by</div></div><div class="sig-col"><div class="sl"></div><div class="sn">${meta.approvedBy}</div><div class="sr">Approved by</div></div></div><div class="stamp">CONTROLLED</div></div><div class="pg"><div class="page-hdr"><div class="page-hdr-left"><strong>${meta.title}</strong><br>Ref: ${meta.docId} | Issue: ${meta.issue} | Rev: ${meta.rev} | Date: ${meta.date}</div></div>${sectionHtml}<div class="end-sec">End of Section</div><div class="stamp">CONTROLLED</div></div></body></html>`;
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current, completed }: { current: WizardStep; completed: Set<WizardStep> }) {
  const steps = Object.entries(STEP_LABELS) as [WizardStep, { num: number; label: string }][];
  const currentIdx = steps.findIndex(([k]) => k === current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {steps.map(([key, { num, label }], i) => {
        const isActive = key === current;
        const isDone = completed.has(key) || i < currentIdx;
        return (
          <React.Fragment key={key}>
            {i > 0 && <div style={{ width: 40, height: 2, background: isDone || isActive ? "var(--accent)" : "var(--border)", transition: "background 0.3s" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, background: isActive ? "rgba(16,217,160,0.08)" : "transparent", border: isActive ? "1px solid rgba(16,217,160,0.2)" : "1px solid transparent" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: isDone ? "var(--accent)" : isActive ? "rgba(16,217,160,0.15)" : "var(--bg-surface-2)", color: isDone ? "#060e1c" : isActive ? "var(--accent)" : "var(--text-muted)", border: isActive ? "1.5px solid var(--accent)" : "1px solid var(--border)" }}>
                {isDone ? <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : num}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--accent)" : isDone ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Pulsing dots animation ───────────────────────────────────────────────────
function PulsingDots({ color = "var(--gold)" }: { color?: string }) {
  return <div style={{ display: "flex", gap: 4 }}>{[0, 0.15, 0.3].map((d, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: color, animation: `pulse-dot 1s ease-in-out ${d}s infinite`, display: "inline-block" }} />)}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WIZARD
// ═══════════════════════════════════════════════════════════════════════════════
// ── Persistence helpers ─────────────────────────────────────────────────────
const GEN_STORAGE_KEY = "aegis-generate-state";

interface PersistedGenState {
  step: WizardStep;
  completed: string[];
  configMode: "generate" | "upload";
  policyType: string;
  customDesc: string;
  selectedFrameworks: string[];
  additionalReqs: string;
  rawDraft: string;
  auditResult: string;
  revisionCount: number;
  finalDraft: string;
  savedId: number | null;
  meta: DocMeta;
  uploadResults: Array<{ filename: string; status: string; id?: number; doc_id?: string; title?: string; chunks_ingested?: number; pages?: number; word_count?: number; file_type?: string; detail?: string }>;
}

function loadGenState(): Partial<PersistedGenState> {
  try {
    const raw = localStorage.getItem(GEN_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveGenState(s: PersistedGenState): void {
  try { localStorage.setItem(GEN_STORAGE_KEY, JSON.stringify(s)); } catch { /* full */ }
}

function GenerateContent() {
  const searchParams = useSearchParams();
  const saved = useRef(loadGenState()).current;

  const [step, setStep] = useState<WizardStep>(saved.step ?? "configure");
  const [completed, setCompleted] = useState<Set<WizardStep>>(new Set((saved.completed ?? []) as WizardStep[]));

  // Configure mode: "generate" or "upload"
  const [configMode, setConfigMode] = useState<"generate" | "upload">(saved.configMode ?? "generate");

  // Upload state (multi-file) — files themselves can't persist, only results
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ filename: string; status: string; id?: number; doc_id?: string; title?: string; chunks_ingested?: number; pages?: number; word_count?: number; file_type?: string; detail?: string }>>(saved.uploadResults ?? []);
  const [uploadError, setUploadError] = useState("");

  // Save to library
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(saved.savedId ?? null);
  const [saveError, setSaveError] = useState("");

  // Configure
  const [policyType, setPolicyType] = useState(searchParams.get("type") ?? saved.policyType ?? "");
  const [customDesc, setCustomDesc] = useState(searchParams.get("q") ?? saved.customDesc ?? "");
  const [selectedFrameworks, setSelectedFrameworks] = useState<Set<string>>(new Set(saved.selectedFrameworks ?? ["nesa", "iso27001", "pdpl"]));
  const [additionalReqs, setAdditionalReqs] = useState(saved.additionalReqs ?? "");

  // Draft
  const [rawDraft, setRawDraft] = useState(saved.rawDraft ?? "");
  const [sections, setSections] = useState<PolicySection[]>(() => saved.rawDraft ? parseToSections(saved.rawDraft) : []);
  const [wordCount, setWordCount] = useState(() => (saved.rawDraft ?? "").split(/\s+/).filter(Boolean).length);
  const [genError, setGenError] = useState("");
  const [autoPhase, setAutoPhase] = useState<AutoPhase>("idle");

  // Audit
  const [auditResult, setAuditResult] = useState(saved.auditResult ?? "");
  const [auditStreaming, setAuditStreaming] = useState(false);

  // Review / comments
  const [userComment, setUserComment] = useState("");
  const [revisionCount, setRevisionCount] = useState(saved.revisionCount ?? 0);
  const [revising, setRevising] = useState(false);

  // Export / finalize
  const [finalDraft, setFinalDraft] = useState(saved.finalDraft ?? "");
  const [finalSections, setFinalSections] = useState<PolicySection[]>(() => saved.finalDraft ? parseToSections(saved.finalDraft) : []);
  const [finalizing, setFinalizing] = useState(false);

  // Meta
  const [meta, setMeta] = useState<DocMeta>(saved.meta ?? {
    docId: "ASH-IT-POL-026", title: "", issue: "01", rev: "00",
    date: new Date().toLocaleDateString("en-GB").replace(/\//g, "."),
    preparedBy: "Information Technology Department",
    reviewedBy: "Shumon A Zaman", approvedBy: "Shamis Al Dhaheri",
    department: "Information Technology",
    transmittalNo: `ASH-QHS-${new Date().getFullYear()}-00001`,
  });

  const draftPanelRef = useRef<HTMLDivElement>(null);
  const auditPanelRef = useRef<HTMLDivElement>(null);

  // ── Persist state to localStorage on key changes ──────────────────────────
  useEffect(() => {
    // Don't persist while actively streaming (partial data)
    if (autoPhase !== "idle" && autoPhase !== "done") return;
    if (auditStreaming || revising || finalizing) return;

    saveGenState({
      step,
      completed: Array.from(completed),
      configMode,
      policyType,
      customDesc,
      selectedFrameworks: Array.from(selectedFrameworks),
      additionalReqs,
      rawDraft,
      auditResult,
      revisionCount,
      finalDraft,
      savedId,
      meta,
      uploadResults,
    });
  }, [step, completed, configMode, policyType, customDesc, selectedFrameworks, additionalReqs, rawDraft, auditResult, revisionCount, finalDraft, savedId, meta, uploadResults, autoPhase, auditStreaming, revising, finalizing]);

  const markComplete = (s: WizardStep) => setCompleted(prev => new Set(prev).add(s));
  const setMetaField = (field: keyof DocMeta, val: string) => setMeta(m => ({ ...m, [field]: val }));
  const toggleFramework = (id: string) => setSelectedFrameworks(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const buildPrompt = useCallback(() => {
    const type = policyType === "Custom Policy (specify below)" ? customDesc : policyType;
    const fw = FRAMEWORKS.filter(f => selectedFrameworks.has(f.id)).map(f => f.label).join(", ");
    let p = `Draft a comprehensive ${type} for Ali & Sons Holding LLC (Abu Dhabi, UAE). The policy must comply with: ${fw}.`;
    if (additionalReqs.trim()) p += ` Additional requirements: ${additionalReqs.trim()}`;
    return p;
  }, [policyType, customDesc, selectedFrameworks, additionalReqs]);

  // ── STEP 2: Auto generate + auto audit ──────────────────────────────────────
  const runAutoGenerate = useCallback(() => {
    const prompt = buildPrompt();
    if (!prompt.trim()) return;
    setGenError(""); setRawDraft(""); setSections([]); setAuditResult(""); setWordCount(0);
    setAutoPhase("researching");
    const token = getToken();
    let acc = "";

    streamSSE("/api/admin/policies/generate/stream", { request: prompt }, token,
      (chunk) => { setAutoPhase("writing"); acc += chunk; setRawDraft(acc); setWordCount(acc.trim().split(/\s+/).filter(Boolean).length); },
      () => {
        // Draft done → parse sections, extract title, then auto-start audit
        const parsed = parseToSections(acc);
        setSections(parsed);
        const firstLine = acc.split("\n")[0].replace(/^#+\s*/, "").trim();
        if (firstLine) setMeta(m => ({ ...m, title: firstLine }));
        markComplete("generating");
        // Auto-start audit immediately
        setAutoPhase("auditing");
        setAuditStreaming(true);
        let auditAcc = "";
        streamSSE("/api/admin/policies/review/stream", { policy_text: acc }, token,
          (chunk) => { auditAcc += chunk; setAuditResult(auditAcc); },
          () => { setAuditStreaming(false); setAutoPhase("done"); setTimeout(() => setStep("review"), 600); },
          () => { setAuditStreaming(false); setAutoPhase("done"); setTimeout(() => setStep("review"), 600); }
        );
      },
      (err) => { setAutoPhase("idle"); setGenError(err); }
    );
  }, [buildPrompt]);

  // Auto-trigger generation exactly once when transitioning configure → generating
  const prevStepRef = useRef(step);
  const genStartedRef = useRef(false);
  useEffect(() => {
    if (step === "generating" && prevStepRef.current === "configure" && !genStartedRef.current) {
      genStartedRef.current = true;
      runAutoGenerate();
    }
    if (step === "configure") {
      genStartedRef.current = false;
    }
    prevStepRef.current = step;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Apply user comments (revise draft + re-audit) ───────────────────────────
  const handleApplyChanges = useCallback(() => {
    if (!userComment.trim() || revising) return;
    setRevising(true);
    setAuditResult("");
    const token = getToken();
    let acc = "";

    streamSSE("/api/admin/policies/generate/revise/stream",
      { policy_text: rawDraft, comments: userComment }, token,
      (chunk) => { acc += chunk; setRawDraft(acc); setWordCount(acc.trim().split(/\s+/).filter(Boolean).length); },
      () => {
        // Revision done → parse new sections, auto re-audit
        const parsed = parseToSections(acc);
        setSections(parsed);
        const firstLine = acc.split("\n")[0].replace(/^#+\s*/, "").trim();
        if (firstLine) setMeta(m => ({ ...m, title: firstLine }));
        setRevisionCount(c => c + 1);
        setUserComment("");
        // Auto re-audit
        setAuditStreaming(true);
        let auditAcc = "";
        streamSSE("/api/admin/policies/review/stream", { policy_text: acc }, token,
          (chunk) => { auditAcc += chunk; setAuditResult(auditAcc); },
          () => { setAuditStreaming(false); setRevising(false); },
          () => { setAuditStreaming(false); setRevising(false); }
        );
      },
      () => { setRevising(false); }
    );
  }, [userComment, revising, rawDraft]);

  // ── Approve → finalize + export ─────────────────────────────────────────────
  const handleApprove = useCallback(() => {
    markComplete("review");
    setStep("export");
    // Auto-finalize
    setFinalizing(true);
    setFinalDraft(""); setFinalSections([]);
    const token = getToken();
    let acc = "";
    streamSSE("/api/admin/policies/generate/finalize/stream",
      { policy_text: rawDraft, doc_id: meta.docId, title: meta.title, issue: meta.issue, rev: meta.rev, date: meta.date, prepared_by: meta.preparedBy, reviewed_by: meta.reviewedBy, approved_by: meta.approvedBy, department: meta.department },
      token,
      (chunk) => { acc += chunk; setFinalDraft(acc); },
      () => { setFinalizing(false); setFinalSections(parseToSections(acc)); markComplete("export"); },
      () => { setFinalizing(false); }
    );
  }, [rawDraft, meta]);

  // ── Export helpers ──
  const handleExportHTML = () => {
    const secs = finalSections.length > 0 ? finalSections : sections;
    if (!secs.length) return;
    const finalMeta = { ...meta, title: meta.title || secs[0]?.title || "IT Policy" };
    const html = buildASHHtml(finalMeta, secs);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${meta.docId}_${finalMeta.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 60)}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportBackend = async (type: "docx" | "pdf") => {
    const text = finalDraft || rawDraft;
    if (!text.trim()) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/admin/policies/export/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          policy_text: text,
          doc_id: meta.docId,
          title: meta.title || draftTitle,
          issue: meta.issue,
          rev: meta.rev,
          date: meta.date,
          prepared_by: meta.preparedBy,
          reviewed_by: meta.reviewedBy,
          approved_by: meta.approvedBy,
          department: meta.department,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Export failed" })); alert(e.detail || "Export failed"); return; }
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${meta.docId}.${type}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { alert("Export failed."); }
  };

  // ── Upload handler (supports single or batch) ─────────────────────────────
  // Auto-revalidate state
  const [autoRevalPhase, setAutoRevalPhase] = useState<"idle" | "uploading" | "revalidating" | "done">("idle");
  const [autoRevalAudit, setAutoRevalAudit] = useState("");
  const [autoRevalUpdate, setAutoRevalUpdate] = useState("");
  const [autoRevalCurrent, setAutoRevalCurrent] = useState("");

  const runRevalidateUpdate = (policyId: number, policyTitle: string) => {
    setAutoRevalPhase("revalidating");
    setAutoRevalCurrent(policyTitle);
    setAutoRevalAudit("");
    setAutoRevalUpdate("");

    const token = getToken();
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    let auditAcc = "";
    let updateAcc = "";

    const finalize = () => {
      setAutoRevalPhase("done");
      // Push the improved draft into the wizard so it's ready for export/approval
      if (updateAcc && updateAcc.trim().length > 100) {
        setRawDraft(updateAcc);
        setSections(parseToSections(updateAcc));
        setWordCount(updateAcc.split(/\s+/).filter(Boolean).length);
        setFinalDraft(updateAcc);
        setFinalSections(parseToSections(updateAcc));
        setAuditResult(auditAcc);
        // Mark all steps complete and jump to export
        setCompleted(new Set(["configure", "generating", "audit", "review", "export"] as WizardStep[]));
        setStep("export");
      }
    };

    fetch(`${BACKEND_URL}/api/admin/policies/managed/${policyId}/revalidate-update/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
      body: "{}",
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        setAutoRevalPhase("done");
        setAutoRevalAudit("Revalidation failed to start.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") { finalize(); return; }
          try {
            const parsed = JSON.parse(data) as { phase?: string; chunk?: string };
            if (parsed.phase === "audit" && parsed.chunk) { auditAcc += parsed.chunk; setAutoRevalAudit(auditAcc); }
            if (parsed.phase === "update" && parsed.chunk) { updateAcc += parsed.chunk; setAutoRevalUpdate(updateAcc); }
          } catch { /* skip */ }
        }
      }
      finalize();
    }).catch(() => {
      setAutoRevalPhase("done");
      setAutoRevalAudit("Connection error during revalidation.");
    });
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    setAutoRevalPhase("uploading");
    setUploadError("");
    setUploadResults([]);
    setAutoRevalAudit("");
    setAutoRevalUpdate("");

    let successResults: Array<{ id: number; title: string; [k: string]: unknown }> = [];

    try {
      if (uploadFiles.length === 1) {
        const fd = new FormData();
        fd.append("file", uploadFiles[0]);
        fd.append("title", uploadTitle.trim());
        fd.append("department", meta.department);
        const res = await apiUpload("/api/admin/policies/upload", fd);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Upload failed");
        const result = { filename: uploadFiles[0].name, status: "ok" as const, ...data };
        setUploadResults([result]);
        setMeta(m => ({ ...m, title: data.title, docId: data.doc_id }));
        successResults = [data];
      } else {
        const fd = new FormData();
        for (const f of uploadFiles) fd.append("files", f);
        fd.append("department", meta.department);
        const res = await apiUpload("/api/admin/policies/upload/batch", fd);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Batch upload failed");
        setUploadResults(data.results || []);
        successResults = (data.results || []).filter((r: { status: string }) => r.status === "ok");
        const first = successResults[0];
        if (first) setMeta(m => ({ ...m, title: String(first.title ?? ""), docId: String(first.doc_id ?? "") }));
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setAutoRevalPhase("idle");
    } finally {
      setUploading(false);
    }

    // Auto-trigger revalidate-and-update on the first successfully uploaded policy
    if (successResults.length > 0) {
      const first = successResults[0];
      runRevalidateUpdate(first.id as number, String(first.title ?? "Uploaded policy"));
    } else {
      setAutoRevalPhase("idle");
    }
  };

  // ── Save to library handler ────────────────────────────────────────────────
  const handleSaveToLibrary = async () => {
    const text = finalDraft || rawDraft;
    if (!text.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await apiFetch("/api/admin/policies/managed/save-draft", {
        method: "POST",
        body: JSON.stringify({
          title: meta.title || draftTitle,
          policy_markdown: text,
          doc_id: meta.docId,
          department: meta.department,
          audit_result: auditResult,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed");
      setSavedId(data.id);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const draftTitle = meta.title || sections[0]?.title || "IT Policy Document";

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: "11px 22px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 15.5, fontWeight: 700, background: "linear-gradient(135deg, var(--accent), var(--gold))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Policy Generator</h1>
          <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Auto-generate, audit, review, approve, export</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StepIndicator current={step} completed={completed} />
          {step !== "configure" && (
            <button
              onClick={() => {
                setStep("configure"); setCompleted(new Set()); setConfigMode("generate");
                setRawDraft(""); setSections([]); setAuditResult(""); setFinalDraft("");
                setFinalSections([]); setRevisionCount(0); setSavedId(null); setAutoPhase("idle");
                setGenError(""); setUploadFiles([]); setUploadResults([]); setUploadError("");
                setMeta(m => ({ ...m, title: "", docId: "ASH-IT-POL-026" }));
                genStartedRef.current = false;
                localStorage.removeItem(GEN_STORAGE_KEY);
              }}
              className="btn-ghost"
              style={{ padding: "4px 10px", fontSize: 10.5, flexShrink: 0 }}
            >
              + New
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>

        {/* ═══ STEP 1: Configure ═══ */}
        {step === "configure" && (
          <div style={{ maxWidth: 780, margin: "0 auto", padding: "28px 24px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Policy Configuration</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Generate a new policy from scratch, or upload an existing PDF to ingest and validate.</p>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 0, marginBottom: 22, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
              {(["generate", "upload"] as const).map(mode => (
                <button key={mode} onClick={() => setConfigMode(mode)} style={{ flex: 1, padding: "10px 16px", cursor: "pointer", fontSize: 12.5, fontWeight: configMode === mode ? 700 : 500, background: configMode === mode ? "rgba(16,217,160,0.08)" : "var(--bg-surface)", color: configMode === mode ? "var(--accent)" : "var(--text-secondary)", border: "none", borderRight: mode === "generate" ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all 0.15s ease" }}>
                  {mode === "generate" ? (
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  ) : (
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  )}
                  {mode === "generate" ? "Generate New Policy" : "Upload Existing PDF"}
                </button>
              ))}
            </div>

            {/* ── Generate mode ── */}
            {configMode === "generate" && (
              <>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>Policy Type</label>
                  <select value={policyType} onChange={(e) => setPolicyType(e.target.value)} style={{ width: "100%", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 13, padding: "9px 12px", outline: "none" }}>
                    <option value="">-- Select a policy type --</option>
                    {POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>
                    {policyType === "Custom Policy (specify below)" ? "Policy Description (required)" : "Additional Requirements (optional)"}
                  </label>
                  <textarea value={policyType === "Custom Policy (specify below)" ? customDesc : additionalReqs} onChange={(e) => policyType === "Custom Policy (specify below)" ? setCustomDesc(e.target.value) : setAdditionalReqs(e.target.value)} placeholder="Describe specific requirements, department focus, or emphasis areas..." rows={3} style={{ width: "100%", resize: "vertical", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 12.5, padding: "10px 12px", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }} />
                </div>

                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 8 }}>Target Compliance Frameworks</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {FRAMEWORKS.map(f => (
                      <button key={f.id} onClick={() => toggleFramework(f.id)} style={{ padding: "10px 12px", borderRadius: 7, cursor: "pointer", textAlign: "left", background: selectedFrameworks.has(f.id) ? "rgba(16,217,160,0.08)" : "var(--bg-surface-2)", border: selectedFrameworks.has(f.id) ? "1.5px solid rgba(16,217,160,0.35)" : "1px solid var(--border)" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selectedFrameworks.has(f.id) ? "var(--accent)" : "var(--text-primary)", marginBottom: 2 }}>{f.label}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{f.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={() => { markComplete("configure"); setStep("generating"); }} disabled={!policyType.trim() || (policyType === "Custom Policy (specify below)" && !customDesc.trim())} className="btn-primary" style={{ width: "100%", padding: "11px 20px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Generate & Audit Automatically
                </button>
              </>
            )}

            {/* ── Upload mode ── */}
            {configMode === "upload" && (
              <>
                {/* Drop zone — multi-file */}
                <div
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = "var(--border)";
                    const dropped = Array.from(e.dataTransfer.files).filter(f => {
                      const ext = f.name.toLowerCase().split(".").pop();
                      return ext === "pdf" || ext === "docx";
                    });
                    if (dropped.length === 0) { setUploadError("Only PDF and DOCX files are accepted."); return; }
                    setUploadFiles(prev => [...prev, ...dropped]);
                    setUploadError("");
                  }}
                  style={{ border: "2px dashed var(--border)", borderRadius: 10, padding: "32px 24px", textAlign: "center", marginBottom: 18, background: "var(--bg-surface)", cursor: "pointer", transition: "border-color 0.15s ease" }}
                  onClick={() => document.getElementById("policy-upload-input")?.click()}
                >
                  <input
                    id="policy-upload-input"
                    type="file"
                    accept=".pdf,.docx"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      if (selected.length) { setUploadFiles(prev => [...prev, ...selected]); setUploadError(""); }
                      e.target.value = "";
                    }}
                  />
                  <div style={{ marginBottom: 10, color: "var(--text-muted)" }}>
                    <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ display: "inline" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                    Drop PDF or DOCX policies here or click to browse
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Supports multiple files — .pdf and .docx up to 20 MB each
                  </p>
                </div>

                {/* File list */}
                {uploadFiles.length > 0 && (
                  <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                        {uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""} selected
                      </span>
                      <button onClick={() => { setUploadFiles([]); setUploadResults([]); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--danger)", fontFamily: "var(--font-sans)" }}>
                        Clear all
                      </button>
                    </div>
                    {uploadFiles.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg-surface-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: f.name.endsWith(".pdf") ? "var(--danger)" : "var(--sapphire)", textTransform: "uppercase", minWidth: 36 }}>
                          {f.name.split(".").pop()}
                        </span>
                        <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={(e) => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_, j) => j !== i)); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "0 4px" }}>&times;</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Title field (only for single file) */}
                {uploadFiles.length === 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>Policy Title (optional — auto-detected from filename)</label>
                    <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="e.g. Access Control Policy" style={{ width: "100%", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 13, padding: "9px 12px", outline: "none", boxSizing: "border-box" }} />
                  </div>
                )}

                {uploadError && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)", fontSize: 12, marginBottom: 14 }}>{uploadError}</div>
                )}

                {/* Batch results */}
                {uploadResults.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>
                      Upload Results — {uploadResults.filter(r => r.status === "ok").length}/{uploadResults.length} succeeded
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {uploadResults.map((r, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 7, background: r.status === "ok" ? "rgba(16,217,160,0.05)" : "rgba(239,68,68,0.05)", border: `1px solid ${r.status === "ok" ? "rgba(16,217,160,0.18)" : "rgba(239,68,68,0.18)"}` }}>
                          {r.status === "ok" ? (
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="var(--success)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="var(--danger)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          )}
                          <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.filename}
                          </span>
                          {r.status === "ok" ? (
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {r.doc_id} &bull; {r.chunks_ingested} chunks &bull; {r.word_count?.toLocaleString()}w
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--danger)" }}>{r.detail}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Auto-revalidation progress */}
                {autoRevalPhase !== "idle" && (
                  <div style={{ marginBottom: 14, borderRadius: 8, border: "1px solid rgba(245,166,35,0.25)", background: "var(--bg-surface)", overflow: "hidden" }}>
                    {/* Progress header */}
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                      {autoRevalPhase === "uploading" && <><span className="spinner" style={{ width: 12, height: 12 }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Uploading &amp; ingesting into knowledge base...</span></>}
                      {autoRevalPhase === "revalidating" && <><span className="spinner" style={{ width: 12, height: 12 }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--gold)" }}>Auto-revalidating &quot;{autoRevalCurrent}&quot; against compliance standards...</span></>}
                      {autoRevalPhase === "done" && <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--success)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span style={{ fontSize: 12, fontWeight: 600, color: "var(--success)" }}>Upload, revalidation &amp; update complete</span></>}
                    </div>
                    {/* Audit results */}
                    {autoRevalAudit && (
                      <div style={{ padding: "10px 14px", borderBottom: autoRevalUpdate ? "1px solid var(--border)" : "none" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold)", marginBottom: 4 }}>Compliance Audit</div>
                        <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 200, overflowY: "auto" }}>
                          {autoRevalAudit}
                          {autoRevalPhase === "revalidating" && !autoRevalUpdate && <span className="cursor-blink">&#9611;</span>}
                        </pre>
                      </div>
                    )}
                    {/* Updated policy */}
                    {autoRevalUpdate && (
                      <div style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", marginBottom: 4 }}>Updated Policy (latest standards applied)</div>
                        <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 200, overflowY: "auto" }}>
                          {autoRevalUpdate}
                          {autoRevalPhase === "revalidating" && <span className="cursor-blink">&#9611;</span>}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={handleUpload} disabled={uploadFiles.length === 0 || uploading || autoRevalPhase === "revalidating"} className="btn-primary" style={{ flex: 1, padding: "11px 20px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {uploading ? (
                      <><span className="spinner" style={{ width: 14, height: 14 }} /> Uploading {uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""}...</>
                    ) : autoRevalPhase === "revalidating" ? (
                      <><span className="spinner" style={{ width: 14, height: 14 }} /> Revalidating...</>
                    ) : (
                      <><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload, Revalidate &amp; Add to Library
                      </>
                    )}
                  </button>
                  {autoRevalPhase === "done" && (
                    <button onClick={() => { markComplete("configure"); setStep("generating"); }} className="btn-gold" style={{ padding: "11px 20px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                      Continue to Generate New
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ STEP 2: Auto Generate + Auto Audit ═══ */}
        {step === "generating" && (
          <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px" }}>
            {/* Progress pipeline */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {([
                { phase: "researching" as const, label: "Researching", icon: "search" },
                { phase: "writing" as const, label: "Writing Draft", icon: "pen" },
                { phase: "auditing" as const, label: "Compliance Audit", icon: "shield" },
              ]).map(({ phase, label }, i) => {
                const isActive = autoPhase === phase;
                const isDone = (["researching", "writing", "auditing"].indexOf(autoPhase) > ["researching", "writing", "auditing"].indexOf(phase)) || autoPhase === "done";
                return (
                  <React.Fragment key={phase}>
                    {i > 0 && <div style={{ width: 24, height: 2, marginTop: 16, background: isDone ? "var(--accent)" : "var(--border)" }} />}
                    <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: isActive ? "rgba(16,217,160,0.06)" : isDone ? "rgba(16,217,160,0.03)" : "var(--bg-surface)", border: `1px solid ${isActive ? "rgba(16,217,160,0.25)" : isDone ? "rgba(16,217,160,0.1)" : "var(--border)"}`, display: "flex", alignItems: "center", gap: 8 }}>
                      {isActive ? <PulsingDots color={phase === "auditing" ? "var(--gold)" : "var(--accent)"} /> : isDone ? <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--border)" }} />}
                      <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--accent)" : isDone ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                      {isActive && phase === "writing" && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{wordCount.toLocaleString()}w</span>}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {genError && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.15)" }}>{genError}</p>}

            {/* Live output */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
              {rawDraft ? (
                <pre style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {rawDraft}{(autoPhase === "writing" || autoPhase === "researching") && <span className="cursor-blink">&#9611;</span>}
                </pre>
              ) : autoPhase !== "idle" ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}><PulsingDots /><p style={{ marginTop: 10, fontSize: 12 }}>Initializing...</p></div>
              ) : null}

              {autoPhase === "auditing" && auditResult && (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: "2px solid var(--border)" }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", marginBottom: 8 }}>Compliance Audit Results</h3>
                  {renderMarkdown(auditResult)}
                  {auditStreaming && <span className="cursor-blink" />}
                </div>
              )}
            </div>

            {autoPhase === "done" && (
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Generation and audit complete. Moving to review...</span>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: Review + Comment Loop ═══ */}
        {step === "review" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%", minHeight: 0 }}>
            {/* Left: Draft */}
            <div ref={draftPanelRef} style={{ overflowY: "auto", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{draftTitle}</span>
                  {revisionCount > 0 && <span style={{ fontSize: 9.5, color: "var(--gold)", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", padding: "1px 7px", borderRadius: 4, fontWeight: 700 }}>Rev {revisionCount}</span>}
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{wordCount.toLocaleString()}w | {sections.length}s</span>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
                {revising && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "9px 12px", background: "rgba(16,217,160,0.05)", border: "1px solid rgba(16,217,160,0.15)", borderRadius: 7 }}>
                    <PulsingDots color="var(--accent)" />
                    <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>Applying your changes...</span>
                  </div>
                )}
                {sections.map(sec => (
                  <div key={sec.id} style={{ marginBottom: 10, borderRadius: 7, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-surface)" }}>
                    <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.18)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(16,217,160,0.07)", border: "1px solid rgba(16,217,160,0.14)", padding: "2px 6px", borderRadius: 4 }}>{sec.number}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)" }}>{sec.title}</span>
                    </div>
                    <div style={{ padding: "9px 12px" }}>
                      {sec.content.trim() ? renderContent(sec.content) : <p style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Empty section</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Comment box + action buttons */}
              <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 16px", background: "var(--bg-surface)" }}>
                <label style={{ display: "block", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 5 }}>Your Comments / Requested Changes</label>
                <textarea
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  placeholder={'e.g. "Strengthen MFA requirements in section 4.2", "Add PDPL Article 20 reference", "Remove appendix section", "Make scope include third-party contractors"...'}
                  rows={3}
                  disabled={revising}
                  style={{ width: "100%", resize: "none", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 12, padding: "8px 11px", outline: "none", lineHeight: 1.6, boxSizing: "border-box", opacity: revising ? 0.5 : 1 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={handleApplyChanges} disabled={!userComment.trim() || revising} className="btn-gold" style={{ flex: 1, padding: "9px 16px", fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {revising ? <><PulsingDots color="var(--gold)" /> Applying...</> : <>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Apply Changes & Re-Audit
                    </>}
                  </button>
                  <button onClick={handleApprove} disabled={revising || auditStreaming} className="btn-primary" style={{ flex: 1, padding: "9px 16px", fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Approve & Generate Report
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Audit scorecard */}
            <div ref={auditPanelRef} style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.12)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--gold)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Compliance Audit</div>
                  <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                    {["NESA", "ISO27001", "PDPL", "NIST", "CIS"].map(b => <span key={b} className="badge badge-gold" style={{ fontSize: 8, padding: "0px 4px" }}>{b}</span>)}
                  </div>
                </div>
                {auditStreaming && <span style={{ fontSize: 10, color: "var(--gold)", marginLeft: "auto", fontWeight: 600 }}>Running...</span>}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
                {auditStreaming && !auditResult && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "40px 0" }}>
                    <PulsingDots color="var(--gold)" />
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Running compliance checks...</p>
                  </div>
                )}
                {auditResult && (
                  <div>
                    {renderMarkdown(auditResult)}
                    {auditStreaming && <span className="cursor-blink" />}
                  </div>
                )}
                {!auditResult && !auditStreaming && (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                    <p style={{ fontSize: 12 }}>Audit results will appear here</p>
                  </div>
                )}
              </div>

              {/* Meta panel (collapsed) */}
              <details style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
                <summary style={{ padding: "8px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", cursor: "pointer" }}>Document Metadata ({meta.docId})</summary>
                <div style={{ padding: "4px 16px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px" }}>
                  {(["docId", "title", "issue", "rev", "date", "preparedBy", "reviewedBy", "approvedBy", "department", "transmittalNo"] as (keyof DocMeta)[]).map(field => (
                    <div key={field} style={["title", "preparedBy", "reviewedBy", "approvedBy", "transmittalNo"].includes(field) ? { gridColumn: "span 2" } : {}}>
                      <label style={{ display: "block", fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>{field}</label>
                      <input value={meta[field]} onChange={(e) => setMetaField(field, e.target.value)} style={{ width: "100%", background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, padding: "4px 8px", outline: "none", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Export ═══ */}
        {step === "export" && (
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>Final Report</h2>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{meta.docId} | {draftTitle} | Rev {revisionCount}</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {savedId ? (
                  <span style={{ padding: "7px 14px", fontSize: 11.5, color: "var(--success)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, background: "rgba(16,217,160,0.06)", border: "1px solid rgba(16,217,160,0.2)", borderRadius: 7 }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Saved (ID: {savedId})
                  </span>
                ) : (
                  <button onClick={handleSaveToLibrary} disabled={saving || (!rawDraft && !finalDraft)} className="btn-gold" style={{ padding: "7px 14px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}>
                    {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving...</> : <>
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      Save to Library
                    </>}
                  </button>
                )}
                <button onClick={handleExportHTML} disabled={!sections.length && !finalSections.length} className="btn-primary" style={{ padding: "7px 14px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  ASH HTML
                </button>
                <button onClick={() => handleExportBackend("docx")} disabled={!rawDraft && !finalDraft} className="btn-ghost" style={{ padding: "7px 12px", fontSize: 11.5 }}>DOCX</button>
                <button onClick={() => handleExportBackend("pdf")} disabled={!rawDraft && !finalDraft} className="btn-ghost" style={{ padding: "7px 12px", fontSize: 11.5 }}>PDF</button>
              </div>
              {saveError && <div style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}>{saveError}</div>}
            </div>

            {finalizing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 14px", background: "rgba(16,217,160,0.05)", border: "1px solid rgba(16,217,160,0.12)", borderRadius: 8 }}>
                <PulsingDots color="var(--accent)" />
                <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Finalizing publication-ready document...</span>
              </div>
            )}

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
              {(finalSections.length > 0 ? finalSections : sections).map(sec => (
                <div key={sec.id} style={{ marginBottom: 10, borderRadius: 7, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-surface)" }}>
                  <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.18)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(16,217,160,0.07)", padding: "2px 6px", borderRadius: 4 }}>{sec.number}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)" }}>{sec.title}</span>
                  </div>
                  <div style={{ padding: "9px 12px" }}>{renderContent(sec.content)}</div>
                </div>
              ))}
              {finalizing && finalDraft && !finalSections.length && (
                <pre style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {finalDraft}<span className="cursor-blink">&#9611;</span>
                </pre>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <button onClick={() => setStep("review")} className="btn-ghost" style={{ padding: "7px 14px", fontSize: 12 }}>Back to Review</button>
              <span style={{ fontSize: 10, color: "var(--text-muted)", alignSelf: "center" }}>Generated by AEGIS Policy Manager for Ali & Sons Holding</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><span className="spinner" style={{ width: 20, height: 20 }} /></div>}>
      <GenerateContent />
    </Suspense>
  );
}
