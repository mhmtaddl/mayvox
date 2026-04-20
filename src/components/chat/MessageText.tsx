/**
 * MessageText — chat mesajı gövdesi renderer.
 *
 * Token-tabanlı parse: text + url. Ardışık text token'ları birleştirilir;
 * her URL için tipine göre uygun preview card render edilir:
 *   - YouTube URL + active player == bu video → YouTubeInlinePlayer (uygulama-içi oynat)
 *   - YouTube URL                              → YouTubePreviewCard (thumbnail + play overlay)
 *   - Diğer                                    → LinkPreviewCard (favicon + title + domain)
 *
 * URL yoksa inline <span> döner. Mesaj veri modeli (msg.text) değişmez.
 */

import React, { useMemo } from 'react';
import { tokenize, type Token } from '../../lib/linkify';
import { parseYouTubeUrl } from '../../lib/youtubeParser';
import { useActiveYouTubeId } from '../../lib/youtubePlayerStore';
import LinkPreviewCard from './LinkPreviewCard';
import YouTubePreviewCard from './YouTubePreviewCard';
import YouTubeInlinePlayer from './YouTubeInlinePlayer';

interface Props {
  text: string;
  className?: string;
  /** Kullanıcının kendi mesajı — preview card yüzey varyantı için forward edilir. */
  isOwn?: boolean;
}

interface Block {
  kind: 'text' | 'url';
  value: string;
}

function toBlocks(tokens: Token[]): Block[] {
  const blocks: Block[] = [];
  let textBuf = '';
  for (const t of tokens) {
    if (t.type === 'text') {
      textBuf += t.value;
    } else {
      if (textBuf.length > 0) {
        blocks.push({ kind: 'text', value: textBuf });
        textBuf = '';
      }
      blocks.push({ kind: 'url', value: t.value });
    }
  }
  if (textBuf.length > 0) {
    blocks.push({ kind: 'text', value: textBuf });
  }
  return blocks;
}

export default function MessageText({ text, className, isOwn }: Props) {
  const blocks = useMemo(() => toBlocks(tokenize(text)), [text]);
  const activeYtId = useActiveYouTubeId();
  const hasUrl = blocks.some(b => b.kind === 'url');

  if (!hasUrl) {
    return (
      <span className={`whitespace-pre-wrap break-words ${className ?? ''}`}>
        {text}
      </span>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className ?? ''}`}>
      {blocks.map((b, i) => {
        if (b.kind === 'text') {
          if (!b.value.trim()) return null;
          return (
            <span key={`t-${i}`} className="whitespace-pre-wrap break-words">
              {b.value}
            </span>
          );
        }
        // URL routing
        const ytId = parseYouTubeUrl(b.value);
        if (ytId) {
          if (activeYtId === ytId) {
            return <YouTubeInlinePlayer key={`yt-play-${i}`} videoId={ytId} isOwn={isOwn} />;
          }
          return (
            <YouTubePreviewCard
              key={`yt-${i}`}
              url={b.value}
              videoId={ytId}
              isOwn={isOwn}
            />
          );
        }
        return <LinkPreviewCard key={`u-${i}`} url={b.value} isOwn={isOwn} />;
      })}
    </div>
  );
}
