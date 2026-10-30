# -*- coding: utf-8 -*-
"""
Script de compilacion integral del Proyecto de Investigacion para UNTELS:
- Incorpora Capitulo III: Metodologia
- Incorpora Capitulo IV: Resultados (con tablas de evidencia, graficos y figuras reales de SQL Server)
- Incorpora Capitulo V: Discusion de Resultados
- Incorpora Conclusiones y Recomendaciones
- Actualiza Referencias en APA 7
- Reconstruye el Indice Automatico Nativo de Word (SDT)
- Aplica formato uniforme: Times New Roman 12 pt, interlineado 1.5, tablas APA 7 de 3 lineas.
"""

import os
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_font_tnr(run, size_pt=12, bold=False, italic=False, color_rgb=(0, 0, 0)):
    run.font.name = "Times New Roman"
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor(*color_rgb)
    # Forzar soporte WordprocessingML en rPr
    rPr = run._r.get_or_add_rPr()
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>')
    rPr.append(rFonts)

def format_p(p, line_spacing=1.5, space_before=0, space_after=6, first_line_indent=0.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY):
    p.paragraph_format.line_spacing = line_spacing
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.first_line_indent = Inches(first_line_indent)
    p.alignment = align

def style_table_apa7(tbl):
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    for r_idx, row in enumerate(tbl.rows):
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        if r_idx == 0:
            trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
            
        for cell in row.cells:
            tcPr = cell._tc.get_or_add_tcPr()
            mar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar>')
            tcPr.append(mar)
            
            top_b = 'single" w:sz="8" w:space="0" w:color="000000' if r_idx == 0 else 'none'
            bot_b = 'single" w:sz="8" w:space="0" w:color="000000' if (r_idx == 0 or r_idx == len(tbl.rows) - 1) else 'none'
            
            borders_xml = f'''
            <w:tcBorders {nsdecls("w")}>
                <w:top w:val="{top_b}"/>
                <w:left w:val="none"/>
                <w:bottom w:val="{bot_b}"/>
                <w:right w:val="none"/>
            </w:tcBorders>
            '''
            tcPr.append(parse_xml(borders_xml))
            
            for p in cell.paragraphs:
                p.paragraph_format.line_spacing = 1.15
                p.paragraph_format.space_before = Pt(2)
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.first_line_indent = Inches(0)
                if r_idx == 0:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for r in p.runs:
                        set_font_tnr(r, size_pt=10, bold=True)
                else:
                    for r in p.runs:
                        set_font_tnr(r, size_pt=10, bold=False)

print("Helper definitions loaded successfully.")
