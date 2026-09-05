import re

with open('template.html', 'r', encoding='utf-8') as f:
    template = f.read()
with open('opportunities.json', 'r', encoding='utf-8') as f:
    data = f.read()
with open('meta.json', 'r', encoding='utf-8') as f:
    meta = f.read()

data = data.replace('</script', '<\\/script')
meta = meta.replace('</script', '<\\/script')
content = template.replace('__DATA__', data).replace('__META__', meta)

# app.html: content-only, for publishing as a Claude Artifact (the platform supplies its
# own <!doctype>/<html>/<head charset>/<body> wrapper — this file must NOT include one).
with open('app.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('wrote app.html (for Artifact publish):', len(content.encode('utf-8')), 'bytes')

# standalone.html: a genuine, complete HTML document with its own charset declaration —
# for opening directly in a browser / serving locally, where nothing else supplies the
# wrapper. Without <meta charset="utf-8">, browsers guess the encoding and render the
# Hebrew as garbage.
title_match = re.search(r'<title>(.*?)</title>', content)
title = title_match.group(1) if title_match else 'טרם'
body_content = content[title_match.end():] if title_match else content

standalone = f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
</head>
<body>
{body_content}
</body>
</html>
"""
with open('standalone.html', 'w', encoding='utf-8') as f:
    f.write(standalone)
print('wrote standalone.html (for local use):', len(standalone.encode('utf-8')), 'bytes')
