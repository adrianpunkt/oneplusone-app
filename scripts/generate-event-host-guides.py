#!/usr/bin/env python3
"""Generate the bilingual, printable event host guides from the app copy."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/content/event-host-playbook.json"
OUTPUT = ROOT / "output/pdf"
PUBLIC = ROOT / "public/host-materials"

BURGUNDY = colors.HexColor("#51151A")
RED = colors.HexColor("#EC3540")
BLUSH = colors.HexColor("#FFF2F0")
OCEAN = colors.HexColor("#204373")
PALE_BLUE = colors.HexColor("#EDF4FA")
MUTED = colors.HexColor("#5F6470")
FAINT = colors.HexColor("#8C8F97")
WHITE = colors.white


def register_fonts() -> None:
    regular = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
    bold = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("OPO-Regular", str(regular)))
        pdfmetrics.registerFont(TTFont("OPO-Bold", str(bold)))
    else:
        pdfmetrics.registerFont(TTFont("OPO-Regular", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("OPO-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))


def styles():
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "Eyebrow", parent=base["Normal"], fontName="OPO-Bold", fontSize=8.5,
            leading=11, textColor=RED, spaceAfter=3, uppercase=True,
        ),
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="OPO-Bold", fontSize=25,
            leading=29, textColor=BURGUNDY, spaceAfter=8,
        ),
        "intro": ParagraphStyle(
            "Intro", parent=base["BodyText"], fontName="OPO-Regular", fontSize=11,
            leading=16, textColor=MUTED, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="OPO-Bold", fontSize=16,
            leading=20, textColor=BURGUNDY, spaceBefore=4, spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "H3", parent=base["Heading3"], fontName="OPO-Bold", fontSize=11.5,
            leading=14, textColor=BURGUNDY, spaceAfter=3,
        ),
        "label": ParagraphStyle(
            "Label", parent=base["Normal"], fontName="OPO-Bold", fontSize=7.5,
            leading=10, textColor=RED, uppercase=True, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="OPO-Regular", fontSize=9.5,
            leading=14, textColor=MUTED,
        ),
        "body_white": ParagraphStyle(
            "BodyWhite", parent=base["BodyText"], fontName="OPO-Regular", fontSize=9.5,
            leading=14, textColor=WHITE,
        ),
        "small": ParagraphStyle(
            "Small", parent=base["BodyText"], fontName="OPO-Regular", fontSize=8,
            leading=11, textColor=FAINT,
        ),
        "footer": ParagraphStyle(
            "Footer", parent=base["Normal"], fontName="OPO-Regular", fontSize=7.5,
            leading=9, textColor=FAINT, alignment=TA_CENTER,
        ),
    }


def bullets(items: list[str], s: dict[str, ParagraphStyle]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(item, s["body"]), leftIndent=3 * mm, spaceAfter=3) for item in items],
        bulletColor=RED,
        bulletFontName="OPO-Bold",
        bulletFontSize=8,
        bulletType="bullet",
        leftIndent=5 * mm,
        spaceAfter=7,
    )


def info_box(title: str, body: str, s: dict[str, ParagraphStyle], background=PALE_BLUE):
    table = Table(
        [[Paragraph(title, s["h3"]), Paragraph(body, s["body"])]],
        colWidths=[47 * mm, 119 * mm],
        hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D9E4EE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def draw_page(canvas, document, locale: str, version: str):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BURGUNDY)
    canvas.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)
    canvas.setFont("OPO-Bold", 8.5)
    canvas.setFillColor(WHITE)
    canvas.drawString(18 * mm, height - 7.8 * mm, "ONE PLUS ONE CLUB")
    canvas.setFont("OPO-Regular", 7.5)
    canvas.drawRightString(width - 18 * mm, height - 7.8 * mm, f"HOST GUIDE · {locale.upper()} · v{version}")
    canvas.setStrokeColor(colors.HexColor("#E8D6D7"))
    canvas.line(18 * mm, 13 * mm, width - 18 * mm, 13 * mm)
    canvas.setFont("OPO-Regular", 7.5)
    canvas.setFillColor(FAINT)
    canvas.drawCentredString(width / 2, 8.5 * mm, f"one plus one club · {document.page}")
    canvas.restoreState()


def build(locale: str, copy: dict, version: str) -> Path:
    s = styles()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / f"event-host-guide-{locale}.pdf"
    document = SimpleDocTemplate(
        str(destination),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=copy["title"],
        author="one plus one club",
        subject="Printable event host instructions",
    )

    story = [
        Spacer(1, 5 * mm),
        Paragraph(copy["eyebrow"].upper(), s["eyebrow"]),
        Paragraph(copy["title"], s["title"]),
        Paragraph(copy["intro"], s["intro"]),
        info_box("PRIVATE HOST MATERIAL" if locale == "en" else "MATERIAL PRIVADO DEL HOST", copy["privacy"], s, BLUSH),
        Spacer(1, 6 * mm),
        Paragraph(copy["beforeTitle"], s["h2"]),
        bullets(copy["before"], s),
        Paragraph(copy["roundsTitle"], s["h2"]),
    ]

    round_cells = []
    for index, round_item in enumerate(copy["rounds"], start=1):
        round_cells.append([
            Paragraph(f"{index} · {round_item['time'].upper()}", s["label"]),
            Paragraph(round_item["title"], s["h3"]),
            Paragraph(round_item["body"], s["body"]),
        ])
    rounds_table = Table(round_cells, colWidths=[36 * mm, 37 * mm, 93 * mm], repeatRows=0)
    rounds_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLUSH),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [BLUSH, WHITE]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E9D9DA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([rounds_table, PageBreak(), Spacer(1, 5 * mm)])
    story.extend([
        Paragraph(copy["principlesTitle"], s["h2"]),
        bullets(copy["principles"], s),
        Spacer(1, 2 * mm),
        info_box(copy["unexpectedTitle"], copy["unexpected"], s, BLUSH),
        Spacer(1, 4 * mm),
        info_box(copy["supportTitle"], copy["support"], s, PALE_BLUE),
        Spacer(1, 8 * mm),
        Paragraph(copy["downloadsTitle"], s["h2"]),
        Paragraph(copy["downloadsDescription"], s["intro"]),
        Spacer(1, 4 * mm),
        KeepTogether([
            Paragraph(copy["sharingTitle"], s["h3"]),
            Paragraph(copy["sharingDescription"], s["body"]),
            Spacer(1, 4 * mm),
            Paragraph(copy["spicyTitle"], s["h3"]),
            Paragraph(copy["spicyDescription"], s["body"]),
        ]),
        Spacer(1, 9 * mm),
        Table(
            [[Paragraph(
                "The event-specific question cards are supplied separately by the founders."
                if locale == "en"
                else "Los fundadores proporcionan por separado las tarjetas de preguntas específicas del evento.",
                s["body_white"],
            )]],
            colWidths=[166 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), OCEAN),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
            ]),
        ),
    ])

    document.build(
        story,
        onFirstPage=lambda canvas, doc: draw_page(canvas, doc, locale, version),
        onLaterPages=lambda canvas, doc: draw_page(canvas, doc, locale, version),
    )
    shutil.copyfile(destination, PUBLIC / destination.name)
    return destination


def main() -> None:
    register_fonts()
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    for locale in ("en", "es"):
        output = build(locale, data["locales"][locale], data["version"])
        print(output)


if __name__ == "__main__":
    main()
