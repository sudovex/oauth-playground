import { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { mono } from '../theme';

const colors = { key: '#a5b4fc', string: '#86efac', number: '#fcd34d', boolean: '#f9a8d4', null: '#94a3b8' };

/** Tiny JSON syntax highlighter: returns React nodes, no innerHTML. */
const highlight = (json) => {
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) out.push(json.slice(last, m.index));
    const t = m[0];
    let type = 'number';
    if (t.startsWith('"')) type = m[2] ? 'key' : 'string';
    else if (t === 'true' || t === 'false') type = 'boolean';
    else if (t === 'null') type = 'null';
    out.push(
      <span key={i++} style={{ color: colors[type] }}>
        {t}
      </span>
    );
    last = re.lastIndex;
  }
  out.push(json.slice(last));
  return out;
};

export default function CodeBlock({ data, maxHeight = 420 }) {
  const [copied, setCopied] = useState(false);
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Box sx={{ position: 'relative', '&:hover .copy': { opacity: 1 } }}>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton
          className="copy"
          size="small"
          onClick={copy}
          sx={{ position: 'absolute', top: 6, right: 6, opacity: 0.4, bgcolor: 'rgba(255,255,255,0.04)', zIndex: 1 }}
        >
          {copied ? <CheckRoundedIcon fontSize="small" color="success" /> : <ContentCopyRoundedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          pr: 6,
          maxHeight,
          overflow: 'auto',
          bgcolor: '#0b0f19',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          fontFamily: mono,
          fontSize: 12.5,
          lineHeight: 1.65,
          color: '#cbd5e1',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {typeof data === 'string' ? text : highlight(text)}
      </Box>
    </Box>
  );
}
