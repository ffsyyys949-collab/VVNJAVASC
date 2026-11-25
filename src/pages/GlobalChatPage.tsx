import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Globe, Phone, Video, PhoneMissed } from 'lucide-react';
import { navigate } from '../App.tsx';
import { WhiteEmojiPicker, StickerPicker, renderMessageContent } from '../components/EmojiStickerPicker.tsx';
import { UserRoleBadge } from '../components/UserRoleBadge.tsx';
import { VoiceNoteBubble, parseVoiceNoteText } from '../components/VoiceNoteControls.tsx';
import { ChatInputBar } from '../components/ChatInputBar.tsx';
import {
  db,
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  updateDoc,
  limit
} from '../firebase.ts';
import { safeApiFetch } from '../lib/zeDataSync.ts';

export interface GlobalMsg {
  id: string;
  username: string;
  username_lower?: string;
  name?: string;
  avatar?: string;
  message: string;
  text?: string;
  timestamp: number;
  country?: string;
}

export default function GlobalChatPage({
  currentUser,
  userCountry = 'ID',
  onBack,
  onOpenProfile,
  onStartCall,
}: {
  currentUser: { id: string; name: string; username?: string; photo?: string };
  userCountry?: string;
  onBack?: () => void;
  onOpenProfile?: (user: any) => void;
  onStartCall?: (type: 'audio' | 'video') => void;
}) {
  const [messages, setMessages] = useState<GlobalMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [allUsers, setAllUsers] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Hide bottom nav while inside Global Chat
  useEffect(() => {
    document.querySelector('.bottom-nav')?.classList.add('hidden');
    return () => {
      document.querySelector('.bottom-nav')?.classList.remove('hidden');
    };
  }, []);

  // LOAD SEMUA USER + STATUS ROLE (OWNER / ADMIN CENTANG PERAK / VIP + CENTANG BIRU) DARI SERVER & FIRESTORE
  useEffect(() => {
    let unsubUsers: any = null;
    const syncServerUsers = async () => {
      const res = await safeApiFetch<any>('/api/users', { timeoutMs: 3500 });
      if (res.ok && Array.isArray(res.data?.users)) {
        setAllUsers((prev) => {
          const next = { ...prev };
          res.data.users.forEach((u: any) => {
            if (u.id) {
              next[u.id] = { ...(next[u.id] || {}), ...u };
              next[String(u.id).toUpperCase()] = { ...(next[String(u.id).toUpperCase()] || {}), ...u };
            }
            if (u.username) {
              next[String(u.username).toLowerCase()] = { ...(next[String(u.username).toLowerCase()] || {}), ...u };
            }
          });
          return next;
        });
      }
    };
    syncServerUsers();
    const timer = setInterval(syncServerUsers, 10000);

    if (db) {
      try {
        unsubUsers = onSnapshot(query(collection(db, 'ze_users'), limit(200)), (snap) => {
          let activeNow = 0;
          const twoMinsAgo = Date.now() - 120000;
          setAllUsers((prev) => {
            const map: Record<string, any> = { ...prev };
            const seenUids = new Set<string>();
            snap.forEach((d) => {
              const data = d.data();
              const uidKey = String(data.id_upper || data.id || d.id).toUpperCase();
              if (!seenUids.has(uidKey)) {
                seenUids.add(uidKey);
                if (Number(data.lastActive || 0) > twoMinsAgo || data.online === true) {
                  activeNow += 1;
                }
              }
              if (data.username_lower) map[data.username_lower] = { ...(map[data.username_lower] || {}), ...data };
              if (data.username) map[data.username.toLowerCase()] = { ...(map[data.username.toLowerCase()] || {}), ...data };
              if (data.id) map[data.id] = { ...(map[data.id] || {}), ...data };
              if (data.id_upper) map[data.id_upper] = { ...(map[data.id_upper] || {}), ...data };
            });
            return map;
          });
          setOnlineCount((prev) => Math.max(1, activeNow, prev));
        });
      } catch (err) {
        console.warn('Firestore load users for role badge notice:', err);
      }
    }
    return () => {
      clearInterval(timer);
      if (unsubUsers) unsubUsers();
    };
  }, []);

  const mergeAndSortMessages = (prev: GlobalMsg[], incoming: GlobalMsg[]): GlobalMsg[] => {
    const byId = new Map<string, GlobalMsg>();
    for (const m of prev) {
      if (m?.id) byId.set(m.id, m);
    }
    for (const m of incoming) {
      if (!m?.id) continue;
      const rawTs: any = (m as any).timestamp;
      const ts =
        typeof rawTs === 'number'
          ? rawTs
          : rawTs && typeof rawTs.toMillis === 'function'
          ? rawTs.toMillis()
          : Number((m as any).createdAt || 0) || Date.now();
      byId.set(m.id, { ...m, timestamp: ts });
    }
    return Array.from(byId.values())
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-150);
  };

  const fetchGlobalChats = async () => {
    const res = await safeApiFetch<any>('/api/global-chats', { timeoutMs: 3500 });
    if (res.ok && Array.isArray(res.data?.messages)) {
      setMessages((prev) => mergeAndSortMessages(prev, res.data.messages));
    }
  };

  useEffect(() => {
    fetchGlobalChats();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchGlobalChats();
    }, 6000);

    const sendHeartbeat = async () => {
      const res = await safeApiFetch<any>('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.id }),
        timeoutMs: 3000,
      });
      if (res.ok && typeof res.data?.count === 'number') {
        setOnlineCount(Math.max(1, res.data.count));
      } else if (db && currentUser?.id) {
        const uidDocId = String(currentUser.id).trim().toUpperCase();
        if (uidDocId && !uidDocId.includes('/')) {
          updateDoc(doc(db, 'ze_users', uidDocId), { lastActive: Date.now(), online: true }).catch(() => {});
        }
      }
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 20000);

    let unsub: any = null;
    if (db) {
      try {
        const q = query(collection(db, 'ze_global_chats'), orderBy('createdAt', 'asc'), limit(150));
        unsub = onSnapshot(q, (snapshot) => {
          const list = snapshot.docs.map((d) => {
            const data = d.data() as any;
            const rawTs = data.timestamp;
            const ts =
              typeof rawTs === 'number'
                ? rawTs
                : rawTs && typeof rawTs.toMillis === 'function'
                ? rawTs.toMillis()
                : Number(data.createdAt || 0) || Date.now();
            return { ...data, id: data.id || d.id, timestamp: ts } as GlobalMsg;
          });
          if (list.length > 0) {
            setMessages((prev) => mergeAndSortMessages(prev, list));
          }
        });
      } catch (e) {
        console.warn('Firestore global chat note:', e);
      }
    }

    return () => {
      clearInterval(interval);
      clearInterval(heartbeatInterval);
      if (unsub) unsub();
    };
  }, [currentUser.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const persistGlobalMessage = async (newMsg: GlobalMsg) => {
    const payload = {
      ...newMsg,
      createdAt: newMsg.timestamp || Date.now(),
      timestamp: newMsg.timestamp || Date.now(),
    };
    const tasks: Promise<any>[] = [
      safeApiFetch('/api/global-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 3500,
      }),
    ];
    if (db) {
      tasks.push(setDoc(doc(db, 'ze_global_chats', newMsg.id), payload).catch(() => {}));
      tasks.push(setDoc(doc(db, 'global_messages', newMsg.id), payload).catch(() => {}));
    }
    await Promise.allSettled(tasks);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setInputText('');
    setShowEmojiPicker(false);
    setShowStickerPicker(false);

    const uLower = (currentUser.username || currentUser.id || '').toLowerCase().trim();
    const newMsg: GlobalMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      username: currentUser.id,
      username_lower: uLower,
      name: currentUser.name || currentUser.username || currentUser.id,
      avatar: currentUser.photo || '',
      message: text,
      text: text,
      timestamp: Date.now(),
      country: userCountry,
    };

    setMessages((prev) => mergeAndSortMessages(prev, [newMsg]));

    try {
      await persistGlobalMessage(newMsg);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendGlobalSticker = (sticker: { url: string }) => {
    const stickerMsg = `[STICKER]:${sticker.url}`;
    const uLower = (currentUser.username || currentUser.id || '').toLowerCase().trim();
    const newMsg: GlobalMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      username: currentUser.id,
      username_lower: uLower,
      name: currentUser.name || currentUser.username || currentUser.id,
      avatar: currentUser.photo || '',
      message: stickerMsg,
      text: stickerMsg,
      timestamp: Date.now(),
      country: userCountry,
    };

    setMessages((prev) => mergeAndSortMessages(prev, [newMsg]));
    setShowStickerPicker(false);
    persistGlobalMessage(newMsg).catch(() => {});
  };

  const handleSendVoiceNote = async (audioUrl: string, durationSec: number) => {
    const vnText = `[VN:${durationSec}]${audioUrl}`;
    const uLower = (currentUser.username || currentUser.id || '').toLowerCase().trim();
    const newMsg: GlobalMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      username: currentUser.id,
      username_lower: uLower,
      name: currentUser.name || currentUser.username || currentUser.id,
      avatar: currentUser.photo || '',
      message: vnText,
      text: vnText,
      timestamp: Date.now(),
      country: userCountry,
    };

    setMessages((prev) => mergeAndSortMessages(prev, [newMsg]));
    await persistGlobalMessage(newMsg);
  };

  const getCountryFlag = (code?: string) => {
    if (!code) return '🌐';
    const c = code.toUpperCase();
    if (c === 'ID') return '🇮🇩';
    if (c === 'MY') return '🇲🇾';
    if (c === 'US') return '🇺🇸';
    if (c === 'SG') return '🇸🇬';
    if (c === 'SA') return '🇸🇦';
    if (c === 'GB') return '🇬🇧';
    if (c === 'JP') return '🇯🇵';
    if (c === 'KR') return '🇰🇷';
    return '🌐';
  };

  const formatChatTime = (timestamp?: number) => {
    if (!timestamp) return 'Baru saja';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Baru saja';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/chats');
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden ze-transparent-page bg-transparent pb-0 mb-0 select-none">
      {/* 1. Header: sticky top-0 glass-navbar */}
      <div className="sticky top-0 z-[100] flex items-center h-[56px] px-3 glass-navbar border-b border-white/10 flex-shrink-0 gap-2.5">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95 cursor-pointer pointer-events-auto relative z-[10000] hover:bg-white/20 transition text-white shrink-0"
          style={{ touchAction: 'manipulation' }}
          title="Kembali ke Chats"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
          <Globe size={16} strokeWidth={1.5} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis">VNJAVA Global Chat</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
            <p className="text-[10px] text-white/60 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
              {onlineCount} online • Realtime Global
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onStartCall && (
            <>
              <button
                type="button"
                onClick={() => onStartCall('audio')}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white cursor-pointer active:scale-95 transition"
                title="Telepon Global"
              >
                <Phone size={15} />
              </button>
              <button
                type="button"
                onClick={() => onStartCall('video')}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white cursor-pointer active:scale-95 transition"
                title="Video Call Global"
              >
                <Video size={15} />
              </button>
            </>
          )}
          <div className="bg-white/10 border border-white/15 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold text-white/90 shrink-0 whitespace-nowrap">
            {currentUser.id} {getCountryFlag(userCountry)}
          </div>
        </div>
      </div>

      {/* 2. Chat list: flex-1 overflow-y-auto */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <Globe size={40} className="mx-auto text-white/25 mb-3" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-white/70">Selamat datang di Global Chat VNJAVA!</p>
            <p className="text-xs text-white/40 mt-1 max-w-xs mx-auto">
              Semua orang di berbagai negara dan perangkat dapat saling mengirim pesan secara realtime di sini.
            </p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.username === currentUser.id;
            const isSticker = (m.message || '').startsWith('[STICKER]:');
            const stickerUrl = isSticker ? m.message.replace('[STICKER]:', '') : null;

            const senderKey = (m.username_lower || m.username || '').toLowerCase();
            const senderData =
              allUsers[senderKey] ||
              allUsers[m.username] ||
              allUsers[(m.username || '').toUpperCase()] ||
              allUsers[(m.name || '').toLowerCase()];
            const isVerified =
              senderData?.verified === true ||
              senderData?.blueTick === true ||
              senderData?.isVerified === true ||
              senderKey === 'ze.io' ||
              senderData?.role === 'owner';
            const displayName = m.name || senderData?.name || m.username;

            const userProfileTarget = senderData || {
              id: m.username,
              name: displayName,
              username: m.username_lower || m.username,
              photo: m.avatar,
              avatar: m.avatar,
              isVerified,
              verified: isVerified
            };

            const userHeader = (
              <div
                onClick={() => onOpenProfile?.(userProfileTarget)}
                className="flex items-center gap-1.5 mb-1 px-1 cursor-pointer hover:opacity-85 transition group"
                title="Lihat Profil"
              >
                <img
                  src={
                    m.avatar ||
                    senderData?.photo ||
                    senderData?.avatar ||
                    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}`
                  }
                  alt={displayName}
                  className="w-5 h-5 rounded-full object-cover border border-white/20 group-hover:border-white/60 transition"
                />
                <span className={`text-[11px] font-bold ${isMe ? 'text-white' : 'text-white/80 group-hover:text-white'}`}>
                  {displayName}
                </span>
                <UserRoleBadge user={isMe ? { ...userProfileTarget, ...currentUser } : userProfileTarget} size="sm" />
              </div>
            );

            if (isSticker && stickerUrl) {
              return (
                <div key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1`}>
                  {userHeader}
                  <div className="w-32 h-32 rounded-2xl overflow-hidden drop-shadow-xl">
                    <img src={stickerUrl} alt="Sticker" className="w-full h-full object-cover rounded-2xl" />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-white/40 mt-1 px-1 font-mono">
                    <span>{m.username}</span>
                    <span>{getCountryFlag(m.country)}</span>
                    <span>•</span>
                    <span>{formatChatTime(m.timestamp)}</span>
                  </div>
                </div>
              );
            }

            const rawContent = m.message || m.text || '';
            const vnData = parseVoiceNoteText(rawContent);
            const isMissedCall = rawContent.startsWith('[CALL_MISSED]:');
            const isCallLog = rawContent.startsWith('[CALL_LOG]:');

            if (isMissedCall || isCallLog) {
              const label = rawContent.replace(/^\[(CALL_MISSED|CALL_LOG)\]:/, '').trim();
              return (
                <div key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {userHeader}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                      isMissedCall
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                        : 'bg-white/10 border-white/15 text-zinc-200'
                    }`}
                  >
                    {isMissedCall ? <PhoneMissed size={14} className="text-rose-400 shrink-0" /> : <Phone size={14} className="text-sky-400 shrink-0" />}
                    <span>{label || (isMissedCall ? 'Panggilan tak terjawab' : 'Panggilan selesai')}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1 px-1 font-mono">
                    <span>{m.username}</span>
                    <span>{getCountryFlag(m.country)}</span>
                    <span>•</span>
                    <span>{formatChatTime(m.timestamp)}</span>
                  </div>
                </div>
              );
            }

            if (vnData) {
              return (
                <div key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {userHeader}
                  <div
                    className={`max-w-[82%] rounded-[22px] px-3.5 py-2.5 shadow-md ${
                      isMe
                        ? 'bg-white text-black rounded-br-none'
                        : 'bg-[#222222] text-white rounded-bl-none border border-zinc-700'
                    }`}
                  >
                    <VoiceNoteBubble url={vnData.url} duration={vnData.duration} isOwn={isMe} />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1 px-1 font-mono">
                    <span>{m.username}</span>
                    <span>{getCountryFlag(m.country)}</span>
                    <span>•</span>
                    <span>{formatChatTime(m.timestamp)}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m.id || idx}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {userHeader}

                <div
                  className={`max-w-[80%] rounded-[22px] px-4 py-2.5 text-sm shadow-md break-words ${
                    isMe
                      ? 'bg-white text-black font-semibold rounded-br-none'
                      : 'bg-[#222222] text-white rounded-bl-none border border-zinc-700'
                  }`}
                >
                  {renderMessageContent(rawContent)}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1 px-1 font-mono">
                  <span>{m.username}</span>
                  <span>{getCountryFlag(m.country)}</span>
                  <span>•</span>
                  <span>{formatChatTime(m.timestamp)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="fixed bottom-[80px] inset-x-0 z-50 max-w-2xl mx-auto px-4">
          <WhiteEmojiPicker
            onSelectEmoji={(code) => setInputText((p) => p + code)}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      )}

      {/* Sticker Picker Popup */}
      {showStickerPicker && (
        <div className="fixed bottom-[80px] inset-x-0 z-50 max-w-2xl mx-auto px-4">
          <StickerPicker
            onSelectSticker={handleSendGlobalSticker}
            onClose={() => setShowStickerPicker(false)}
          />
        </div>
      )}

      {/* 3. Input: Unified Non-Overflowing ChatInputBar */}
      <div className="flex-shrink-0 glass-navbar border-t border-white/10 sticky bottom-0 z-50">
        <div className="max-w-2xl mx-auto">
          <ChatInputBar
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSendMessage}
            placeholder="Ketik pesan ke seluruh dunia..."
            disabled={isSending}
            userId={currentUser.id}
            showEmoji
            emojiActive={showEmojiPicker}
            onToggleEmoji={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowStickerPicker(false);
            }}
            showSticker
            stickerActive={showStickerPicker}
            onToggleSticker={() => {
              setShowStickerPicker(!showStickerPicker);
              setShowEmojiPicker(false);
            }}
            onSendVoiceNote={handleSendVoiceNote}
          />
        </div>
      </div>
    </div>
  );
}
