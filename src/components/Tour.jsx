import { useEffect, useLayoutEffect, useState } from 'react';
import { Box, Button, Paper, Popper, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/system';

const DONE_KEY = 'oauth-tester:tour-done:v1';

export const isTourDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
};

const markTourDone = () => {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* storage blocked: the tour shows again next visit */
  }
};

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 9999px rgba(3,6,12,0.72), 0 0 0 0 rgba(124,140,255,0.75); }
  70%  { box-shadow: 0 0 0 9999px rgba(3,6,12,0.72), 0 0 0 14px rgba(124,140,255,0); }
  100% { box-shadow: 0 0 0 9999px rgba(3,6,12,0.72), 0 0 0 0 rgba(124,140,255,0); }
`;

const nudge = {
  bottom: keyframes`0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}`,
  top: keyframes`0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}`,
  left: keyframes`0%,100%{transform:translateX(0)}50%{transform:translateX(-6px)}`,
  right: keyframes`0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}`,
};

const ARROW = 18;

/**
 * Coach-mark tour: dims the page, rings the target element and points at it with an arrowed card.
 * steps: [{ target: () => HTMLElement, title, body, placement }]
 */
export default function Tour({ open, steps, onClose, onFinish, finishLabel = 'Done' }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [arrowEl, setArrowEl] = useState(null);
  const step = steps[index];
  const anchor = open && step ? step.target() : null;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Keep the spotlight on the target while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!anchor) return;
    let frame;
    const update = () => {
      const r = anchor.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [anchor]);

  const close = () => {
    markTourDone();
    onClose();
  };
  const finish = () => {
    markTourDone();
    onClose();
    onFinish?.();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open || !anchor || !rect) return null;

  const last = index === steps.length - 1;
  const side = (step.placement || 'bottom').split('-')[0];
  const pad = 6;

  return (
    <>
      {/* Click-catcher so the page can't be used behind the tour. */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: (t) => t.zIndex.modal }} onClick={(e) => e.stopPropagation()} />
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: 3,
          border: '2px solid #7c8cff',
          pointerEvents: 'none',
          zIndex: (t) => t.zIndex.modal,
          transition: 'all 250ms ease',
          animation: `${pulse} 1.8s ease-out infinite`,
        }}
      />
      <Popper
        open
        anchorEl={anchor}
        placement={step.placement || 'bottom'}
        sx={{
          zIndex: (t) => t.zIndex.modal + 1,
          maxWidth: 'calc(100vw - 32px)',
          [`&[data-popper-placement*="bottom"] .tour-arrow`]: { top: -ARROW / 2 },
          [`&[data-popper-placement*="top"] .tour-arrow`]: { bottom: -ARROW / 2 },
          [`&[data-popper-placement*="left"] .tour-arrow`]: { right: -ARROW / 2 },
          [`&[data-popper-placement*="right"] .tour-arrow`]: { left: -ARROW / 2 },
        }}
        modifiers={[
          { name: 'offset', options: { offset: [0, pad + ARROW] } },
          { name: 'arrow', enabled: true, options: { element: arrowEl, padding: 12 } },
          { name: 'preventOverflow', options: { padding: 16 } },
          { name: 'flip', options: { padding: 16 } },
        ]}
      >
        <Box sx={{ animation: `${nudge[side]} 1.6s ease-in-out infinite` }}>
          <Box
            ref={setArrowEl}
            className="tour-arrow"
            sx={{
              position: 'absolute',
              width: ARROW,
              height: ARROW,
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                bgcolor: '#7c8cff',
                boxShadow: '0 0 12px rgba(124,140,255,0.6)',
                transform: {
                  bottom: 'rotate(45deg)',
                  top: 'rotate(225deg)',
                  left: 'rotate(135deg)',
                  right: 'rotate(-45deg)',
                }[side],
              },
            }}
          />
          <Paper
            elevation={12}
            role="dialog"
            aria-labelledby="tour-title"
            sx={{ p: 2.5, width: 352, maxWidth: '100%', border: '1.5px solid #7c8cff', borderRadius: 3, position: 'relative' }}
          >
            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              STEP {index + 1} OF {steps.length}
            </Typography>
            <Typography id="tour-title" variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
              {step.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {step.body}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={0.75} sx={{ flex: 1 }}>
                {steps.map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: i === index ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      bgcolor: i === index ? 'primary.main' : 'divider',
                      transition: 'width 200ms',
                    }}
                  />
                ))}
              </Stack>
              <Button size="small" color="inherit" onClick={close}>
                Skip
              </Button>
              {index > 0 && (
                <Button size="small" color="inherit" onClick={() => setIndex(index - 1)}>
                  Back
                </Button>
              )}
              <Button size="small" variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={last ? finish : () => setIndex(index + 1)}>
                {last ? finishLabel : 'Next'}
              </Button>
            </Stack>
          </Paper>
        </Box>
      </Popper>
    </>
  );
}
