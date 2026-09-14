"""Monta a comparacao lado a lado a partir dos arquivos realmente renderizados."""
from PIL import Image, ImageDraw, ImageFont
import re

FONTE = "/usr/local/share/fonts/RobotoMono-{}.ttf"
f_code = ImageFont.truetype(FONTE.format("Regular"), 21)
f_lbl  = ImageFont.truetype(FONTE.format("Bold"), 27)
f_tit  = ImageFont.truetype(FONTE.format("Bold"), 38)
f_sub  = ImageFont.truetype(FONTE.format("Regular"), 22)

FUNDO   = (13, 17, 23)
PAINEL  = (22, 27, 34)
BORDA   = (48, 54, 61)
TEXTO   = (139, 148, 158)
TAG     = (121, 192, 255)
COMENT  = (255, 123, 114)
VERDE   = (63, 185, 80)
VERMELHO= (248, 81, 73)
BRANCO  = (230, 237, 243)

def linhas(caminho):
    bruto = open(caminho).read().split("\n")
    # Colapsa as linhas em branco que a remocao do comentario deixa para tras,
    # senao o painel "depois" vira um vazio sem sentido visual.
    saida, anterior_vazia = [], False
    for l in bruto:
        vazia = l.strip() == ""
        if vazia and anterior_vazia:
            continue
        saida.append(l.rstrip())
        anterior_vazia = vazia
    return saida

def e_comentario(l):
    s = l.strip()
    return s.startswith("<!--") or s.startswith("//") or s.startswith("/*")

A, D = linhas("demo/navegador_antes.html"), linhas("demo/navegador_depois.html")
n = max(len(A), len(D))

LARG, PAD, TOPO = 1680, 44, 150
PAINEL_L = (LARG - PAD * 3) // 2
ALT_LINHA = 30
ALT_PAINEL = 62 + n * ALT_LINHA + 24
ALT = TOPO + ALT_PAINEL + 96

img = Image.new("RGB", (LARG, ALT), FUNDO)
d = ImageDraw.Draw(img)

d.text((PAD, 40), "O que o navegador recebe", font=f_tit, fill=BRANCO)
d.text((PAD, 92), "mesma página, antes e depois da extensão", font=f_sub, fill=TEXTO)

def painel(x, titulo, cor, conteudo, marcar):
    d.rounded_rectangle([x, TOPO, x + PAINEL_L, TOPO + ALT_PAINEL], 14, fill=PAINEL, outline=BORDA, width=2)
    d.rounded_rectangle([x, TOPO, x + PAINEL_L, TOPO + 50], 14, fill=(30, 36, 44))
    d.rectangle([x, TOPO + 36, x + PAINEL_L, TOPO + 50], fill=(30, 36, 44))
    d.text((x + 20, TOPO + 13), titulo, font=f_lbl, fill=cor)

    y = TOPO + 62
    for linha in conteudo:
        if marcar and e_comentario(linha):
            d.rectangle([x + 8, y - 4, x + PAINEL_L - 8, y + ALT_LINHA - 8], fill=(58, 24, 26))
            d.rectangle([x + 8, y - 4, x + 12, y + ALT_LINHA - 8], fill=VERMELHO)
            cor_txt = COMENT
        elif e_comentario(linha):
            cor_txt = COMENT
        elif linha.strip().startswith("<"):
            cor_txt = TAG
        else:
            cor_txt = TEXTO
        d.text((x + 22, y), linha[:58], font=f_code, fill=cor_txt)
        y += ALT_LINHA

painel(PAD, "ANTES", VERMELHO, A, True)
painel(PAD * 2 + PAINEL_L, "DEPOIS", VERDE, D, False)

rodape = ALT - 62
d.text((PAD, rodape), "5 comentários internos visíveis no inspecionar", font=f_sub, fill=COMENT)
d.text((PAD * 2 + PAINEL_L, rodape), "0 — o servidor descartou antes de responder", font=f_sub, fill=VERDE)

img.save("demo/comparacao.png")
print("gerada:", img.size, "| linhas antes/depois:", len(A), len(D))
