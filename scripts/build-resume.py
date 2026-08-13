#!/usr/bin/env python3
"""Build the public, one-page resume at public/resume.pdf.

The content below is intentionally a compact external-facing summary of the
experience represented in src/data/about.ts and src/data/experience.ts. Keep
claims, titles, dates, and contact paths in sync before generating the PDF.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "resume.pdf"

# Keep the public name consistent with src/lib/site.ts. The previous resume's
# full professional name is retained here as provenance for future editors.
PUBLIC_NAME = "Miguel Casillas"
FULL_PROFESSIONAL_NAME = "Miguel Angel Casillas Maldonado"
CONTACT_LINE = (
    "Redmond, WA | "
    '<link href="mailto:micasillm@gmail.com">micasillm@gmail.com</link> | '
    "+1 425 208 6760 | "
    '<link href="https://elopenmike.com">elopenmike.com</link> | '
    '<link href="https://www.linkedin.com/in/mcasillas17/">linkedin.com/in/mcasillas17</link> | '
    '<link href="https://github.com/mcasillas17">github.com/mcasillas17</link>'
)


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def section(title: str, styles: dict[str, ParagraphStyle]):
    return [
        Spacer(1, 6),
        paragraph(title.upper(), styles["section"]),
        HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#334155")),
        Spacer(1, 3),
    ]


def role(
    title: str,
    dates: str,
    bullets: list[str],
    styles: dict[str, ParagraphStyle],
):
    heading = Table(
        [[paragraph(f"<b>{title}</b>", styles["role"]), paragraph(dates, styles["dates"])]],
        colWidths=[4.95 * inch, 2.05 * inch],
    )
    heading.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    bullet_rows = [[paragraph(f"<bullet>-</bullet>{bullet}", styles["bullet"])] for bullet in bullets]
    return KeepTogether([heading, Table(bullet_rows, colWidths=[7 * inch], style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ])), Spacer(1, 3)])


def main() -> None:
    stylesheets = getSampleStyleSheet()
    styles = {
        "name": ParagraphStyle(
            "ResumeName", parent=stylesheets["Heading1"], fontName="Helvetica-Bold",
            fontSize=18, leading=21, alignment=TA_CENTER, spaceAfter=2,
        ),
        "contact": ParagraphStyle(
            "Contact", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.2,
            leading=10, alignment=TA_CENTER, textColor=colors.HexColor("#334155"),
        ),
        "section": ParagraphStyle(
            "Section", parent=stylesheets["Heading2"], fontName="Helvetica-Bold",
            fontSize=9.5, leading=11, textColor=colors.HexColor("#0F172A"), spaceAfter=1,
        ),
        "summary": ParagraphStyle(
            "Summary", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.7,
            leading=11.2, textColor=colors.HexColor("#1E293B"),
        ),
        "company": ParagraphStyle(
            "Company", parent=stylesheets["Normal"], fontName="Helvetica-Bold", fontSize=10,
            leading=12, textColor=colors.HexColor("#0F172A"),
        ),
        "location": ParagraphStyle(
            "Location", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.7,
            leading=12, alignment=TA_RIGHT, textColor=colors.HexColor("#334155"),
        ),
        "role": ParagraphStyle(
            "Role", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.9,
            leading=11.2, textColor=colors.HexColor("#0F172A"),
        ),
        "dates": ParagraphStyle(
            "Dates", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.7,
            leading=11.2, alignment=TA_RIGHT, textColor=colors.HexColor("#334155"),
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.45,
            leading=10.3, leftIndent=8, firstLineIndent=-8, textColor=colors.HexColor("#1E293B"),
        ),
        "education": ParagraphStyle(
            "Education", parent=stylesheets["Normal"], fontName="Helvetica", fontSize=8.7,
            leading=11.2, textColor=colors.HexColor("#1E293B"),
        ),
    }

    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=letter, leftMargin=0.55 * inch, rightMargin=0.55 * inch,
        topMargin=0.42 * inch, bottomMargin=0.42 * inch,
        title=f"Resume - {PUBLIC_NAME}", author=FULL_PROFESSIONAL_NAME,
    )
    story = [
        paragraph(PUBLIC_NAME, styles["name"]),
        paragraph(CONTACT_LINE, styles["contact"]),
        *section("Summary", styles),
        paragraph(
            "Backend and platform engineer focused on AI-powered systems, large-scale messaging, "
            "data-grounded analytics, and observability. Builds services and APIs that remain scalable, "
            "secure, and understandable as they grow.",
            styles["summary"],
        ),
        *section("Experience", styles),
    ]

    company = Table(
        [[paragraph("Microsoft", styles["company"]), paragraph("Redmond, WA", styles["location"])]],
        colWidths=[4.95 * inch, 2.05 * inch],
    )
    company.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.extend([
        company,
        role("Software Engineer II", "Mar 2024 - Present", [
            "Build backend services and APIs for large-scale email and push messaging, including agent tooling for content suggestions and campaign insights.",
            "Delivered content-insight and campaign-diagnostics pipelines with end-to-end telemetry, dashboards, and documentation for partner teams.",
            "Modernized release pipelines with shared YAML templates, artifact signing, secret scanning, gated approvals, and compliance checks.",
        ], styles),
        role("Software Engineer", "Nov 2018 - Feb 2024", [
            "Migrated a campaign metadata portal, integrated email delivery for commercial scenarios, and automated its data updates.",
            "Contributed to the general-availability release of an enterprise scheduling service; exposed reusable APIs and improved meeting-time suggestions and flexible-hours support.",
            "Modernized cross-platform telemetry SDK build systems, built an Objective-C wrapper for a C++ SDK, and improved diagnostic filtering and C# wrapper support.",
        ], styles),
        *section("Skills", styles),
        paragraph(
            "<b>Languages:</b> C#, TypeScript, Go, C++, JavaScript, SQL &nbsp;&nbsp; "
            "<b>Backend and APIs:</b> .NET, Node.js, gRPC, REST APIs, distributed systems, microservices<br/>"
            "<b>AI and infrastructure:</b> LLM and agent tooling, MCP, Azure, Docker, CI/CD, telemetry, observability",
            styles["education"],
        ),
        *section("Education", styles),
        paragraph(
            "<b>Instituto Tecnologico Autonomo de Mexico (ITAM)</b> - Computer Engineering, May 2017",
            styles["education"],
        ),
    ])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.build(story)


if __name__ == "__main__":
    main()
