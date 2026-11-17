"""Monta legendas e recortes a partir da gravação real de record-demo.mjs.

Requer ffmpeg/ffprobe e Pillow. Não produz ações ou respostas fictícias.
"""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'test-results/demo-recording'
MEDIA = ROOT / 'docs/media'
manifest = json.loads((RAW / 'manifest.json').read_text())
assert manifest['realProvider'] and manifest['isolatedContext']
source = Path(manifest['rawPath'])
assert source.is_file()
duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(source)]))
chapters = manifest['chapters']
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(font_path, 28)
small = ImageFont.truetype(font_path, 18)
for index, chapter in enumerate(chapters):
    image = Image.new('RGB', (1600, 80), '#10233a')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1600, 3), fill='#6ad8b2')
    draw.text((28, 13), chapter['text'], font=font, fill='white')
    draw.text((29, 50), 'Demonstração real • dados fictícios • gravação em navegador isolado • sem áudio', font=small, fill='#c2d8e4')
    image.save(RAW / f'caption-{index}.png')

args = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(source)]
for index in range(len(chapters)):
    args.extend(['-i', str(RAW / f'caption-{index}.png')])
filters = ['[0:v]pad=1600:1080:0:0:color=0x10233a[base]']
for index, chapter in enumerate(chapters):
    begin = 0 if index == 0 else chapter['at']
    end = chapters[index + 1]['at'] if index + 1 < len(chapters) else duration
    previous = 'base' if index == 0 else f'v{index - 1}'
    filters.append(f'[{previous}][{index + 1}:v]overlay=0:1000:enable=\'between(t,{begin},{end})\'[v{index}]')
args.extend(['-filter_complex', ';'.join(filters), '-map', f'[v{len(chapters) - 1}]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '25', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', str(MEDIA / 'demonstracao.mp4')])
subprocess.run(args, check=True)

def gif(name, begin, end):
    assert 0 <= begin < end <= duration + 1
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-ss', str(begin), '-t', str(end - begin), '-i', str(MEDIA / 'demonstracao.mp4'), '-filter_complex', '[0:v]fps=8,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', str(MEDIA / name)], check=True)

gif('cadastro-lote.gif', chapters[1]['at'], chapters[3]['at'])
gif('revisao-exclusao.gif', chapters[4]['at'], chapters[6]['at'])

def timestamp(seconds, separator=','):
    milliseconds = int(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02}{separator}{milliseconds:03}'

subtitles = []
for index, chapter in enumerate(chapters):
    start = 0 if index == 0 else chapter['at']
    end = chapters[index + 1]['at'] if index + 1 < len(chapters) else duration
    subtitles.append(f'{index + 1}\n{timestamp(start)} --> {timestamp(end)}\n{chapter["text"]}\n')
(MEDIA / 'demonstracao.srt').write_text('\n'.join(subtitles))
summary = {
    'gravadoEm': manifest['recordedAt'], 'modelo': manifest['model'],
    'inferenciaReal': True, 'respostasSimuladas': False, 'contextoIsolado': True,
    'duracaoSegundos': round(duration, 2), 'audio': False, 'legendasIncorporadas': True,
    'capitulos': chapters, 'turnos': manifest['turns'], 'verificacoes': manifest['checks'],
    'observacao': 'O vídeo mostra uma execução bem-sucedida. Não mede taxa de sucesso, economia de tempo nem qualidade geral do modelo. Login realizado antes da captura.',
}
(MEDIA / 'evidencias.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
for file in [MEDIA / 'demonstracao.mp4', MEDIA / 'cadastro-lote.gif', MEDIA / 'revisao-exclusao.gif']:
    assert file.stat().st_size > 1000
    print(f'{file.name}: {file.stat().st_size / 1024 / 1024:.2f} MiB')
