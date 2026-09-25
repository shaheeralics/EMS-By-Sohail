import { useState, useEffect, useRef } from 'react';
import { Mic, Pause, Play, Square, Scissors, Trash2, Move, Check, Upload, RotateCcw, ZoomIn, ZoomOut, Edit3, Minimize2 } from 'lucide-react';

export interface AudioTrackClip {
    id: string;
    [key: string]: any;
}

export interface TimelineHistoryStep {
    [key: string]: any;
}

export const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Convert Web Audio API AudioBuffer to WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels: Float32Array[] = [];
    let sampleRate = buffer.sampleRate;
    let offset = 0;
    let pos = 0;

    function writeString(str: string) {
        for (let i = 0; i < str.length; i++) {
            out.setUint8(pos++, str.charCodeAt(i));
        }
    }
    function writeUint32(data: number) {
        out.setUint32(pos, data, true);
        pos += 4;
    }
    function writeUint16(data: number) {
        out.setUint16(pos, data, true);
        pos += 2;
    }

    writeString('RIFF');
    writeUint32(length - 8);
    writeString('WAVE');
    writeString('fmt ');
    writeUint32(16);
    writeUint16(1); // PCM
    writeUint16(numOfChan);
    writeUint32(sampleRate);
    writeUint32(sampleRate * 2 * numOfChan);
    writeUint16(numOfChan * 2);
    writeUint16(16); // 16-bit PCM
    writeString('data');
    writeUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (offset < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            out.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }
    return new Blob([out], { type: 'audio/wav' });
}



export const SharedVoiceRecorder = ({ onAudioChange }: { initialAudioUrl?: string | null, onAudioChange: (blob: Blob | null) => void }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

    // Refs to avoid React async state closure bugs for Web Audio API Punch-In Overwrite
    const prevAudioBlobRef = useRef<Blob | null>(null);
    const overwriteSeekRef = useRef<number | null>(null);
    const originalMainBlobRef = useRef<Blob | null>(null);
    // Missing refs omitted from original snippet
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<any>(null);
    const analyserRef = useRef<any>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timerIntervalRef = useRef<number | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    // Punch-In Overwrite Timeline State
    const [audioDuration, setAudioDuration] = useState(0);
    const [seekTime, setSeekTime] = useState(0);

    // CapCut Multi-Track Studio States (Track 1: Main | Track 2: Voice-Over)
    const [showTimelineEditor, setShowTimelineEditor] = useState(false);
    const [mainClips, setMainClips] = useState<AudioTrackClip[]>([]);
    const [voiceoverClips, setVoiceoverClips] = useState<AudioTrackClip[]>([]);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [selectedTrack, setSelectedTrack] = useState<'main' | 'voiceover'>('main');
    const [timelineHistory, setTimelineHistory] = useState<TimelineHistoryStep[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
    const [visualizerData, setVisualizerData] = useState<number[]>(new Array(30).fill(10));
    const [isPlaying, setIsPlaying] = useState(false);
    const [timelineZoom, setTimelineZoom] = useState(1);
    const [isTimelineRecording, setIsTimelineRecording] = useState(false);
    const timelineScrollRef = useRef<HTMLDivElement | null>(null);
    const timelineTrackRef = useRef<HTMLDivElement | null>(null);

    // Voice Note handling (Record, Pause, Resume, Stop & Web Audio Timeline Punch-In Overwrite)
    const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineTrackRef.current) return;
        const rect = timelineTrackRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        let newSeekTime = (clickX / width) * audioDuration;
        if (newSeekTime < 0) newSeekTime = 0;
        if (newSeekTime > audioDuration) newSeekTime = audioDuration;
        
        setSeekTime(newSeekTime);
        if (audioElementRef.current) {
            audioElementRef.current.currentTime = newSeekTime;
        }
    };

    const startRecording = async (overwriteSeek?: number) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
            mediaRecorderRef.current = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
            audioChunksRef.current = [];

            // Save prior audio blob and seek timestamp into REFS to avoid stale state closures
            let targetPriorBlob = audioBlob;
            if (!targetPriorBlob && audioPreviewUrl && overwriteSeek !== undefined && overwriteSeek > 0) {
                try {
                    const resp = await fetch(audioPreviewUrl);
                    targetPriorBlob = await resp.blob();
                } catch (e) {
                    console.error('Failed to fetch prior audio blob:', e);
                }
            }

            if (overwriteSeek !== undefined && overwriteSeek > 0 && targetPriorBlob) {
                prevAudioBlobRef.current = targetPriorBlob;
                overwriteSeekRef.current = overwriteSeek;
            } else {
                prevAudioBlobRef.current = null;
                overwriteSeekRef.current = null;
            }

            // Setup Real-time Audio Visualizer
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioCtx;
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.5;
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyserRef.current = analyser;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            dataArrayRef.current = dataArray;

            const updateVisualizer = () => {
                if (!analyserRef.current || !dataArrayRef.current) return;
                analyserRef.current.getByteTimeDomainData(dataArrayRef.current as any);

                // Compute overall mic volume via RMS
                let sum = 0;
                for (let j = 0; j < dataArrayRef.current.length; j++) {
                    const v = (dataArrayRef.current[j] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / dataArrayRef.current.length);
                const volume = Math.min(1, rms * 4); // boost sensitivity

                // Generate bars: natural waveform shape modulated by live volume
                const newData: number[] = [];
                for (let i = 0; i < 35; i++) {
                    const baseShape = Math.sin(i * 0.45) * 20 + Math.cos(i * 1.1) * 12 + 45;
                    const jitter = (Math.random() - 0.5) * volume * 40;
                    const h = baseShape + (volume * 35) + jitter;
                    newData.push(Math.max(15, Math.min(95, h)));
                }
                setVisualizerData(newData);
                animationFrameRef.current = requestAnimationFrame(updateVisualizer);
            };
            updateVisualizer();

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const recordedNewBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const cutTime = overwriteSeekRef.current;

                try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const newArrayBuf = await recordedNewBlob.arrayBuffer();
                    const newAudioBuf = await audioCtx.decodeAudioData(newArrayBuf);
                    const recordedDur = newAudioBuf.duration;

                    if (cutTime !== null && cutTime !== undefined) {
                        // Track 2 Voice-Over Recording at playhead timestamp
                        const voStart = cutTime;
                        const voEnd = voStart + recordedDur;

                        const newVoClip: AudioTrackClip = {
                            id: `vo-${Date.now()}`,
                            track: 'voiceover',
                            name: `Voice-Over (${formatTimer(voStart)})`,
                            start: voStart,
                            end: voEnd,
                            sourceStart: 0,
                            buffer: newAudioBuf
                        };

                        const updatedVOs = [...voiceoverClips, newVoClip];
                        setVoiceoverClips(updatedVOs);
                        setSelectedClipId(newVoClip.id);
                        setSelectedTrack('voiceover');

                        const newMaxDur = Math.max(audioDuration, voEnd);
                        setAudioDuration(newMaxDur);
                        setTrimEnd(newMaxDur);

                        await autoMixPreview(mainClips, updatedVOs, newMaxDur);
                        pushTimelineHistory(mainClips, updatedVOs, newMaxDur);
                    } else {
                        // Track 1 Primary Main Audio Note Recording
                        originalMainBlobRef.current = recordedNewBlob;
                        setAudioBlob(recordedNewBlob);

                        if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
                        const newUrl = URL.createObjectURL(recordedNewBlob);
                        setAudioPreviewUrl(newUrl);

                        setAudioDuration(recordedDur);
                        setTrimStart(0);
                        setTrimEnd(recordedDur);

                        const newMainClip: AudioTrackClip = {
                            id: `main-${Date.now()}`,
                            track: 'main',
                            name: 'Main Track',
                            start: 0,
                            end: recordedDur,
                            sourceStart: 0
                        };

                        setMainClips([newMainClip]);
                        setVoiceoverClips([]);
                        setSelectedClipId(newMainClip.id);
                        setSelectedTrack('main');

                        await autoMixPreview([newMainClip], [], recordedDur);
                        setTimelineHistory([{ mainClips: [newMainClip], voiceoverClips: [], audioDuration: recordedDur }]);
                        setHistoryIndex(0);
                    }
                } catch (err) {
                    console.error('Failed to process recorded audio clip:', err);
                }

                prevAudioBlobRef.current = null;
                overwriteSeekRef.current = null;
                stream.getTracks().forEach(track => track.stop());

                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setIsPaused(false);
            setRecordingTime(0);

            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err: any) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('Microphone not supported! If you are accessing this via an IP address (http://192.168...), browsers block the microphone. You MUST use localhost or a secure HTTPS tunnel (like Cloudflare).');
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert('Microphone access denied! Please allow microphone permissions in your browser settings or Windows/Mac privacy settings.');
            } else {
                alert('Microphone access failed: ' + err.message);
            }
            console.error('Mic access error:', err);
        }
    };

    // Generate Real Waveform Amplitude Peaks from PCM Channel Data
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setIsPaused(false);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        }
    };
    const generateRealWaveformPeaks = async (blob: Blob | null, url: string | null) => {
        let sourceBlob = blob;
        if (!sourceBlob && url) {
            try {
                const res = await fetch(url);
                sourceBlob = await res.blob();
            } catch (e) {
                console.error('Failed to fetch audio for peaks:', e);
            }
        }
        if (!sourceBlob) return;

        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuf = await sourceBlob.arrayBuffer();
            const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
            const channelData = audioBuf.getChannelData(0);

            const samplesCount = 72;
            const blockSize = Math.floor(channelData.length / samplesCount);
            const peaks: number[] = [];

            for (let i = 0; i < samplesCount; i++) {
                const start = i * blockSize;
                let sum = 0;
                const stride = Math.max(1, Math.floor(blockSize / 20));
                let count = 0;
                for (let j = 0; j < blockSize; j += stride) {
                    sum += Math.abs(channelData[start + j] || 0);
                    count++;
                }
                const avg = count > 0 ? sum / count : 0;
                peaks.push(avg);
            }

            const maxPeak = Math.max(...peaks, 0.001);
            const normalized = peaks.map(p => Math.max(15, Math.min(95, (p / maxPeak) * 85 + 10)));
            setWaveformPeaks(normalized);
        } catch (err) {
            console.error('Failed to calculate real waveform peaks:', err);
        }
    };

    useEffect(() => {
        if (showTimelineEditor || audioPreviewUrl) {
            generateRealWaveformPeaks(audioBlob, audioPreviewUrl);
        }
    }, [audioBlob, audioPreviewUrl, showTimelineEditor]);

    // Play / Pause Toggle for Timeline Audio
    const togglePlayPause = () => {
        if (!audioElementRef.current) return;
        if (audioElementRef.current.paused) {
            audioElementRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
        } else {
            audioElementRef.current.pause();
            setIsPlaying(false);
        }
    };

    // Inline Timeline Voice-Over Recording (records into Track 2 without leaving editor)
    const timelineRecordStartRef = useRef<number>(0);
    const timelineRecordTimerRef = useRef<number | null>(null);

    const startTimelineRecording = () => {
        if (isTimelineRecording) {
            stopTimelineRecording();
            return;
        }
        const recordStart = seekTime;
        timelineRecordStartRef.current = recordStart;
        setIsTimelineRecording(true);

        // Start actual mic recording using the existing startRecording with seekTime
        startRecording(recordStart);

        // Move the playhead forward as recording progresses
        let elapsed = 0;
        timelineRecordTimerRef.current = window.setInterval(() => {
            elapsed += 0.1;
            const newTime = recordStart + elapsed;
            setSeekTime(newTime);
            // Extend timeline if recording goes beyond current duration
            if (newTime > audioDuration) {
                setAudioDuration(newTime);
            }
            // Auto-scroll timeline to keep playhead visible
            if (timelineScrollRef.current && timelineTrackRef.current) {
                const scrollContainer = timelineScrollRef.current;
                const trackWidth = timelineTrackRef.current.scrollWidth;
                const playheadX = (newTime / Math.max(audioDuration, newTime)) * trackWidth;
                const containerWidth = scrollContainer.clientWidth;
                if (playheadX > scrollContainer.scrollLeft + containerWidth - 50) {
                    scrollContainer.scrollLeft = playheadX - containerWidth + 80;
                }
            }
        }, 100);
    };

    const stopTimelineRecording = () => {
        setIsTimelineRecording(false);
        if (timelineRecordTimerRef.current) {
            clearInterval(timelineRecordTimerRef.current);
            timelineRecordTimerRef.current = null;
        }
        stopRecording();
    };

    // Push a new snapshot state into history stack
    const pushTimelineHistory = (mClips: AudioTrackClip[], voClips: AudioTrackClip[], dur: number) => {
        setTimelineHistory(prevHistory => {
            const activeHistory = prevHistory.slice(0, historyIndex + 1);
            const newStep: TimelineHistoryStep = {
                mainClips: JSON.parse(JSON.stringify(mClips)),
                voiceoverClips: JSON.parse(JSON.stringify(voClips)),
                audioDuration: dur
            };
            const updated = [...activeHistory, newStep];
            setHistoryIndex(updated.length - 1);
            return updated;
        });
    };

    // Undo (Ctrl + Z)
    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIdx = historyIndex - 1;
            const targetStep = timelineHistory[newIdx];
            const restoredMain = JSON.parse(JSON.stringify(targetStep.mainClips));
            const restoredVO = JSON.parse(JSON.stringify(targetStep.voiceoverClips));
            setMainClips(restoredMain);
            setVoiceoverClips(restoredVO);
            setAudioDuration(targetStep.audioDuration);
            setHistoryIndex(newIdx);
            autoMixPreview(restoredMain, restoredVO, targetStep.audioDuration);
        }
    };

    // Redo (Ctrl + Y or Ctrl + Shift + Z)
    const handleRedo = () => {
        if (historyIndex < timelineHistory.length - 1) {
            const newIdx = historyIndex + 1;
            const targetStep = timelineHistory[newIdx];
            const restoredMain = JSON.parse(JSON.stringify(targetStep.mainClips));
            const restoredVO = JSON.parse(JSON.stringify(targetStep.voiceoverClips));
            setMainClips(restoredMain);
            setVoiceoverClips(restoredVO);
            setAudioDuration(targetStep.audioDuration);
            setHistoryIndex(newIdx);
            autoMixPreview(restoredMain, restoredVO, targetStep.audioDuration);
        }
    };

    // Keyboard Shortcuts listener (Space: Play/Pause, Delete/Backspace: Delete selected clip, Ctrl+Z: Undo, Ctrl+Y/Ctrl+Shift+Z: Redo, Ctrl+/Ctrl-: Zoom)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!showTimelineEditor) return;
            const activeElem = document.activeElement;
            const tagName = activeElem?.tagName.toUpperCase();
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.code === 'Delete' || e.code === 'Backspace') {
                if (selectedClipId) {
                    e.preventDefault();
                    deleteSelectedClip();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                setTimelineZoom(prev => Math.min(5, prev + 0.5));
            } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                setTimelineZoom(prev => Math.max(1, prev - 0.5));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showTimelineEditor, isPlaying, selectedClipId, mainClips, voiceoverClips, audioDuration, historyIndex, timelineHistory]);

    // Auto-sync initial timeline clip segment when audio metadata loads
    useEffect(() => {
        if (audioDuration > 0) {
            if (mainClips.length === 0 || (mainClips.length === 1 && mainClips[0].end === 0)) {
                const initialMain: AudioTrackClip[] = [{ id: `main-${Date.now()}`, track: 'main', name: 'Main Track', start: 0, end: audioDuration, sourceStart: 0 }];
                setMainClips(initialMain);
                setTrimStart(0);
                setTrimEnd(audioDuration);
                autoMixPreview(initialMain, [], audioDuration);
                setTimelineHistory([{ mainClips: initialMain, voiceoverClips: [], audioDuration }]);
                setHistoryIndex(0);
            }
        } else {
            setMainClips([]);
            setVoiceoverClips([]);
            setTrimStart(0);
            setTrimEnd(0);
            setTimelineHistory([]);
            setHistoryIndex(-1);
        }
    }, [audioDuration]);

    // Move / Drag clip along timeline
    const handleClipMouseDown = (e: React.MouseEvent, clip: AudioTrackClip) => {
        e.preventDefault();
        e.stopPropagation();

        setSelectedClipId(clip.id);
        setSelectedTrack(clip.track);

        const startX = e.clientX;
        const initialStart = clip.start;
        const clipDur = clip.end - clip.start;
        let hasMoved = false;

        const onMouseMove = (moveEvt: MouseEvent) => {
            if (Math.abs(moveEvt.clientX - startX) > 2) {
                hasMoved = true;
            }
            if (!hasMoved || !timelineTrackRef.current || audioDuration <= 0) return;

            const rect = timelineTrackRef.current.getBoundingClientRect();
            const deltaX = moveEvt.clientX - startX;
            const deltaTime = (deltaX / rect.width) * audioDuration;

            const newStart = Math.max(0, initialStart + deltaTime);
            const newEnd = newStart + clipDur;

            if (clip.track === 'main') {
                setMainClips(prev => prev.map(c => c.id === clip.id ? { ...c, start: newStart, end: newEnd } : c));
            } else {
                setVoiceoverClips(prev => prev.map(c => c.id === clip.id ? { ...c, start: newStart, end: newEnd } : c));
            }

            if (newEnd > audioDuration) {
                setAudioDuration(newEnd);
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            // Re-mix audio immediately & save history step
            setMainClips(latestMain => {
                setVoiceoverClips(latestVO => {
                    autoMixPreview(latestMain, latestVO, audioDuration);
                    if (hasMoved) {
                        pushTimelineHistory(latestMain, latestVO, audioDuration);
                    }
                    return latestVO;
                });
                return latestMain;
            });
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // Mouse Crop / Trim Left or Right edge of an individual clip box
    const handleClipTrimMouseDown = (e: React.MouseEvent, clip: AudioTrackClip, side: 'start' | 'end') => {
        e.preventDefault();
        e.stopPropagation();

        setSelectedClipId(clip.id);
        setSelectedTrack(clip.track);

        const startX = e.clientX;
        const initialStart = clip.start;
        const initialEnd = clip.end;
        const initialSrcStart = clip.sourceStart !== undefined ? clip.sourceStart : clip.start;

        const onMouseMove = (moveEvt: MouseEvent) => {
            if (!timelineTrackRef.current || audioDuration <= 0) return;

            const rect = timelineTrackRef.current.getBoundingClientRect();
            const deltaX = moveEvt.clientX - startX;
            const deltaTime = (deltaX / rect.width) * audioDuration;

            if (side === 'start') {
                const newStart = Math.min(initialEnd - 0.1, Math.max(0, initialStart + deltaTime));
                const deltaStart = newStart - initialStart;
                const newSrcStart = Math.max(0, initialSrcStart + deltaStart);

                if (clip.track === 'main') {
                    setMainClips(prev => prev.map(c => c.id === clip.id ? { ...c, start: newStart, sourceStart: newSrcStart } : c));
                } else {
                    setVoiceoverClips(prev => prev.map(c => c.id === clip.id ? { ...c, start: newStart, sourceStart: newSrcStart } : c));
                }
            } else {
                const newEnd = Math.max(initialStart + 0.1, initialEnd + deltaTime);
                if (newEnd > audioDuration) {
                    setAudioDuration(newEnd);
                }
                if (clip.track === 'main') {
                    setMainClips(prev => prev.map(c => c.id === clip.id ? { ...c, end: newEnd } : c));
                } else {
                    setVoiceoverClips(prev => prev.map(c => c.id === clip.id ? { ...c, end: newEnd } : c));
                }
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            // Trigger real-time auto-mix & save history step
            setMainClips(latestMain => {
                setVoiceoverClips(latestVO => {
                    autoMixPreview(latestMain, latestVO, audioDuration);
                    pushTimelineHistory(latestMain, latestVO, audioDuration);
                    return latestVO;
                });
                return latestMain;
            });
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    /*
    // Nudge selected clip left or right by N seconds
    const nudgeSelectedClip = (seconds: number) => {
        if (!selectedClipId) return;

        if (selectedTrack === 'main') {
            setMainClips(prev => {
                const next = prev.map(c => {
                    if (c.id !== selectedClipId) return c;
                    const dur = c.end - c.start;
                    const newStart = Math.max(0, c.start + seconds);
                    const newEnd = newStart + dur;
                    if (newEnd > audioDuration) setAudioDuration(newEnd);
                    return { ...c, start: newStart, end: newEnd };
                });
                autoMixPreview(next, voiceoverClips, audioDuration);
                pushTimelineHistory(next, voiceoverClips, audioDuration);
                return next;
            });
        } else {
            setVoiceoverClips(prev => {
                const next = prev.map(c => {
                    if (c.id !== selectedClipId) return c;
                    const dur = c.end - c.start;
                    const newStart = Math.max(0, c.start + seconds);
                    const newEnd = newStart + dur;
                    if (newEnd > audioDuration) setAudioDuration(newEnd);
                    return { ...c, start: newStart, end: newEnd };
                });
                autoMixPreview(mainClips, next, audioDuration);
                pushTimelineHistory(mainClips, next, audioDuration);
                return next;
            });
        }
    };
    */

    // Split clip at exact playhead position (Multi-cut)
    const splitClipAtPlayhead = () => {
        if (audioDuration <= 0) return;
        const splitTime = seekTime;

        if (selectedTrack === 'voiceover') {
            setVoiceoverClips(prev => {
                const idx = prev.findIndex(c => !c.isDeleted && splitTime > c.start + 0.05 && splitTime < c.end - 0.05);
                if (idx === -1) {
                    alert(`Cannot cut Voice-Over track at ${formatTimer(splitTime)}. Move playhead inside a Voice-Over clip.`);
                    return prev;
                }
                const target = prev[idx];
                const offsetFromClipStart = splitTime - target.start;
                const targetSourceStart = target.sourceStart ?? 0;

                const c1: AudioTrackClip = {
                    ...target,
                    id: `vo-${Date.now()}-A`,
                    end: splitTime,
                    sourceStart: targetSourceStart
                };
                const c2: AudioTrackClip = {
                    ...target,
                    id: `vo-${Date.now()}-B`,
                    start: splitTime,
                    sourceStart: targetSourceStart + offsetFromClipStart
                };
                const copy = [...prev];
                copy.splice(idx, 1, c1, c2);
                setSelectedClipId(c2.id);
                autoMixPreview(mainClips, copy, audioDuration);
                pushTimelineHistory(mainClips, copy, audioDuration);
                return copy;
            });
        } else {
            setMainClips(prev => {
                const idx = prev.findIndex(c => !c.isDeleted && splitTime > c.start + 0.05 && splitTime < c.end - 0.05);
                if (idx === -1) {
                    alert(`Cannot cut Track 1 at ${formatTimer(splitTime)}. Move playhead inside an active Track 1 clip.`);
                    return prev;
                }
                const target = prev[idx];
                const offsetFromClipStart = splitTime - target.start;
                const targetSourceStart = target.sourceStart ?? target.start;

                const c1: AudioTrackClip = {
                    ...target,
                    id: `main-${Date.now()}-A`,
                    end: splitTime,
                    sourceStart: targetSourceStart
                };
                const c2: AudioTrackClip = {
                    ...target,
                    id: `main-${Date.now()}-B`,
                    start: splitTime,
                    sourceStart: targetSourceStart + offsetFromClipStart
                };
                const copy = [...prev];
                copy.splice(idx, 1, c1, c2);
                setSelectedClipId(c2.id);
                autoMixPreview(copy, voiceoverClips, audioDuration);
                pushTimelineHistory(copy, voiceoverClips, audioDuration);
                return copy;
            });
        }
    };

    // Delete selected clip segment
    const deleteSelectedClip = () => {
        if (!selectedClipId) {
            alert('Click on any clip on Track 1 or Track 2 to select it first.');
            return;
        }
        const nextMain = mainClips.map(c => c.id === selectedClipId ? { ...c, isDeleted: true } : c);
        const nextVO = voiceoverClips.map(c => c.id === selectedClipId ? { ...c, isDeleted: true } : c);
        setMainClips(nextMain);
        setVoiceoverClips(nextVO);
        setSelectedClipId(null);
        autoMixPreview(nextMain, nextVO, audioDuration);
        pushTimelineHistory(nextMain, nextVO, audioDuration);
    };

    // Reset all cuts
    // const resetAllCuts = () => {
    //     const freshMain: AudioTrackClip[] = [{ id: `main-${Date.now()}`, track: 'main', name: 'Main Track', start: 0, end: audioDuration, sourceStart: 0 }];
    //     setMainClips(freshMain);
    //     setVoiceoverClips([]);
    //     setTrimStart(0);
    //     setTrimEnd(audioDuration);
    //     setSelectedClipId(null);
    //     autoMixPreview(freshMain, [], audioDuration);
    //     pushTimelineHistory(freshMain, [], audioDuration);
    // };

    // Helper function to calculate exact end timestamp of the last active clip
    const calculateMaxClipEnd = (mClips: AudioTrackClip[], voClips: AudioTrackClip[]): number => {
        const activeM = mClips.filter(c => !c.isDeleted);
        const activeV = voClips.filter(c => !c.isDeleted);
        let maxEnd = 0;
        for (const m of activeM) {
            if (m.end > maxEnd) maxEnd = m.end;
        }
        for (const v of activeV) {
            if (v.end > maxEnd) maxEnd = v.end;
        }
        return maxEnd;
    };

    // Auto-mix Multi-Track Preview whenever clips change so playback immediately mutes Track 1 during Voice-Over
    const autoMixPreview = async (mClips: AudioTrackClip[], voClips: AudioTrackClip[], currentMaxDur: number) => {
        let mainSourceBlob = originalMainBlobRef.current || audioBlob;
        if (!mainSourceBlob && audioPreviewUrl) {
            try {
                const resp = await fetch(audioPreviewUrl);
                mainSourceBlob = await resp.blob();
            } catch (err) { }
        }

        const activeMain = mClips.filter(c => !c.isDeleted);
        const activeVO = voClips.filter(c => !c.isDeleted);

        if (!mainSourceBlob && activeVO.length === 0) return;

        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            let sampleRate = 44100;
            let channels = 1;
            let mainAudioBuf: AudioBuffer | null = null;

            if (mainSourceBlob) {
                const mainArr = await mainSourceBlob.arrayBuffer();
                mainAudioBuf = await audioCtx.decodeAudioData(mainArr);
                sampleRate = mainAudioBuf.sampleRate;
                channels = mainAudioBuf.numberOfChannels;
            }

            // Timeline duration automatically matches the end of the last active clip!
            let maxDur = calculateMaxClipEnd(mClips, voClips);
            if (maxDur <= 0) {
                maxDur = mainAudioBuf ? mainAudioBuf.duration : currentMaxDur;
            }

            if (maxDur > 0) {
                setAudioDuration(maxDur);
            }

            const totalSamples = Math.floor(maxDur * sampleRate);
            if (totalSamples <= 0) return;

            const outputBuf = audioCtx.createBuffer(channels, totalSamples, sampleRate);

            // 1. Copy Track 1 (Main Track) - EXPLICITLY MUTE DURING VOICE-OVER REGIONS
            if (mainAudioBuf) {
                for (let c = 0; c < channels; c++) {
                    const outData = outputBuf.getChannelData(c);
                    const srcData = mainAudioBuf.getChannelData(c);

                    for (const clip of activeMain) {
                        if (clip.start >= clip.end) continue;
                        const sourceStartSec = clip.sourceStart !== undefined ? clip.sourceStart : clip.start;
                        const clipDurationSec = clip.end - clip.start;
                        const clipSamplesCount = Math.floor(clipDurationSec * sampleRate);
                        const srcStartSamp = Math.floor(sourceStartSec * sampleRate);

                        for (let i = 0; i < clipSamplesCount; i++) {
                            const timelineSec = clip.start + (i / sampleRate);
                            const targetIdx = Math.floor(timelineSec * sampleRate);
                            const srcIdx = srcStartSamp + i;

                            const isMutedByVO = activeVO.some(vo => timelineSec >= vo.start && timelineSec <= vo.end);

                            if (targetIdx >= 0 && targetIdx < totalSamples) {
                                if (isMutedByVO) {
                                    outData[targetIdx] = 0;
                                } else if (srcIdx >= 0 && srcIdx < srcData.length) {
                                    outData[targetIdx] = srcData[srcIdx];
                                }
                            }
                        }
                    }
                }
            }

            // 2. Mix Track 2 (Voice-Over Clips)
            for (const vo of activeVO) {
                if (!vo.buffer) continue;
                const voBuf = vo.buffer;
                const voSourceStartSec = vo.sourceStart !== undefined ? vo.sourceStart : 0;
                const voDurationSec = vo.end - vo.start;
                const voSamplesCount = Math.floor(voDurationSec * sampleRate);
                const voSrcStartSamp = Math.floor(voSourceStartSec * sampleRate);

                for (let c = 0; c < channels; c++) {
                    const outData = outputBuf.getChannelData(c);
                    const voData = voBuf.numberOfChannels > c ? voBuf.getChannelData(c) : voBuf.getChannelData(0);

                    for (let j = 0; j < voSamplesCount; j++) {
                        const timelineSec = vo.start + (j / sampleRate);
                        const targetIdx = Math.floor(timelineSec * sampleRate);
                        const srcIdx = voSrcStartSamp + j;

                        if (targetIdx >= 0 && targetIdx < totalSamples && srcIdx >= 0 && srcIdx < voData.length) {
                            outData[targetIdx] = voData[srcIdx];
                        }
                    }
                }
            }

            const mixedWavBlob = audioBufferToWavBlob(outputBuf);
            if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
            const newUrl = URL.createObjectURL(mixedWavBlob);
            setAudioPreviewUrl(newUrl);

            if (audioElementRef.current) {
                const currentPos = audioElementRef.current.currentTime;
                audioElementRef.current.src = newUrl;
                audioElementRef.current.load();
                audioElementRef.current.currentTime = currentPos;
            }
        } catch (err) {
            console.error('Auto-mix preview failed:', err);
        }
    };

    // Apply & Stitch remaining active clips and save
    const applyStitchingAndSave = async () => {
        let mainSourceBlob = audioBlob;
        if (!mainSourceBlob && audioPreviewUrl) {
            try {
                const resp = await fetch(audioPreviewUrl);
                mainSourceBlob = await resp.blob();
            } catch (err) {
                console.error('Failed to fetch audio preview:', err);
            }
        }

        const activeMain = mainClips.filter(c => !c.isDeleted);
        const activeVO = voiceoverClips.filter(c => !c.isDeleted);

        if (!mainSourceBlob && activeVO.length === 0) {
            alert('No audio tracks found to export.');
            return;
        }

        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            let sampleRate = 44100;
            let channels = 1;
            let mainAudioBuf: AudioBuffer | null = null;

            if (mainSourceBlob) {
                const mainArr = await mainSourceBlob.arrayBuffer();
                mainAudioBuf = await audioCtx.decodeAudioData(mainArr);
                sampleRate = mainAudioBuf.sampleRate;
                channels = mainAudioBuf.numberOfChannels;
            }

            let maxDur = calculateMaxClipEnd(activeMain, activeVO);
            if (maxDur <= 0) {
                maxDur = mainAudioBuf ? mainAudioBuf.duration : 0;
            }

            const effEnd = trimEnd > 0 ? Math.min(trimEnd, maxDur) : maxDur;
            const totalDuration = effEnd - trimStart;
            if (totalDuration <= 0) {
                alert('No valid audio range remaining.');
                return;
            }

            const totalSamples = Math.floor(totalDuration * sampleRate);
            const outputBuf = audioCtx.createBuffer(channels, totalSamples, sampleRate);

            // 1. Copy Track 1 (Main Track) for non-deleted clips bounded by trimStart & trimEnd
            if (mainAudioBuf) {
                for (let c = 0; c < channels; c++) {
                    const outData = outputBuf.getChannelData(c);
                    const srcData = mainAudioBuf.getChannelData(c);

                    for (const clip of activeMain) {
                        const clipStartSec = Math.max(clip.start, trimStart);
                        const clipEndSec = Math.min(clip.end, trimEnd > 0 ? trimEnd : maxDur);
                        if (clipStartSec >= clipEndSec) continue;

                        const sourceStartSec = clip.sourceStart !== undefined ? clip.sourceStart : clip.start;
                        const offsetFromClipStart = clipStartSec - clip.start;
                        const actualSrcStartSec = sourceStartSec + offsetFromClipStart;

                        const clipDurationSec = clipEndSec - clipStartSec;
                        const clipSamplesCount = Math.floor(clipDurationSec * sampleRate);
                        const srcStartSamp = Math.floor(actualSrcStartSec * sampleRate);

                        for (let i = 0; i < clipSamplesCount; i++) {
                            const timelineSec = clipStartSec + (i / sampleRate);
                            const targetIdx = Math.floor((timelineSec - trimStart) * sampleRate);
                            const srcIdx = srcStartSamp + i;

                            // Explicitly check if timelineSec falls in any active Voice-Over clip region
                            const isMutedByVO = activeVO.some(vo => timelineSec >= vo.start && timelineSec <= vo.end);

                            if (targetIdx >= 0 && targetIdx < totalSamples) {
                                if (isMutedByVO) {
                                    outData[targetIdx] = 0; // Mute Track 1 Audio completely during Voice-Over
                                } else if (srcIdx >= 0 && srcIdx < srcData.length) {
                                    outData[targetIdx] = srcData[srcIdx];
                                }
                            }
                        }
                    }
                }
            }

            // 2. Auto-Mute Track 1 & Mix Track 2 (Voice-Over Clips)
            for (const vo of activeVO) {
                if (!vo.buffer) continue;
                const voBuf = vo.buffer;
                const voStartSec = Math.max(vo.start, trimStart);
                const voEndSec = Math.min(vo.end, trimEnd > 0 ? trimEnd : maxDur);
                if (voStartSec >= voEndSec) continue;

                const voSourceStartSec = vo.sourceStart !== undefined ? vo.sourceStart : 0;
                const offsetFromClipStart = voStartSec - vo.start;
                const actualVoSrcStartSec = voSourceStartSec + offsetFromClipStart;

                const voDurationSec = voEndSec - voStartSec;
                const voSamplesCount = Math.floor(voDurationSec * sampleRate);
                const voSrcStartSamp = Math.floor(actualVoSrcStartSec * sampleRate);

                for (let c = 0; c < channels; c++) {
                    const outData = outputBuf.getChannelData(c);
                    const voData = voBuf.numberOfChannels > c ? voBuf.getChannelData(c) : voBuf.getChannelData(0);

                    for (let j = 0; j < voSamplesCount; j++) {
                        const timelineSec = voStartSec + (j / sampleRate);
                        const targetIdx = Math.floor((timelineSec - trimStart) * sampleRate);
                        const srcIdx = voSrcStartSamp + j;

                        if (targetIdx >= 0 && targetIdx < totalSamples && srcIdx >= 0 && srcIdx < voData.length) {
                            outData[targetIdx] = voData[srcIdx];
                        }
                    }
                }
            }

            const finalWavBlob = audioBufferToWavBlob(outputBuf);
            setAudioBlob(finalWavBlob);
            if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
            const newUrl = URL.createObjectURL(finalWavBlob);
            setAudioPreviewUrl(newUrl);

            if (audioElementRef.current) {
                const currentPos = audioElementRef.current.currentTime;
                audioElementRef.current.src = newUrl;
                audioElementRef.current.load();
                audioElementRef.current.currentTime = currentPos;
            }
        } catch (err) {
            console.error('Failed to stitch audio:', err);
        }
    };

    // Auto-sync external changes
    const isInitialMount = useRef(true);
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (onAudioChange) onAudioChange(audioBlob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioBlob]);

    const clearAudio = () => {
        setAudioBlob(null);
        setAudioPreviewUrl(null);
        setMainClips([]);
        setVoiceoverClips([]);
        setTimelineHistory([]);
        setHistoryIndex(-1);
    };
    const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAudioBlob(file);
        const url = URL.createObjectURL(file);
        setAudioPreviewUrl(url);
        originalMainBlobRef.current = file;
        
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuf = await file.arrayBuffer();
            const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
            const dur = audioBuf.duration;
            setAudioDuration(dur);
            setTrimStart(0);
            setTrimEnd(dur);
            
            const newMainClip: AudioTrackClip = {
                id: `main-${Date.now()}`,
                track: 'main',
                name: file.name,
                start: 0,
                end: dur,
                sourceStart: 0,
                buffer: audioBuf
            };
            
            setMainClips([newMainClip]);
            setVoiceoverClips([]);
            setSelectedClipId(newMainClip.id);
            setSelectedTrack('main');
            
            autoMixPreview([newMainClip], [], dur);
            setTimelineHistory([{ mainClips: [newMainClip], voiceoverClips: [], audioDuration: dur }]);
            setHistoryIndex(0);
        } catch (err) {
            console.error('Failed to parse uploaded audio:', err);
        }
    };

    return (
        <div className="w-full">
            <div className="space-y-6">
<div className="space-y-6">
                                                    

                                                    <div className="bg-[#050D10] border border-teal-900/40 rounded-xl p-6 text-center">

                                                        {/* Recording Controls */}
                                                        <div className="flex flex-col items-center justify-center gap-4">
                                                            {!isRecording && !audioPreviewUrl && !isTimelineRecording && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startRecording()}
                                                                    className="w-[60px] h-[60px] rounded-full bg-[#FF3B30] hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/40 transition-all transform hover:scale-105"
                                                                >
                                                                    <Mic size={28} />
                                                                </button>
                                                            )}

                                                            {isRecording && !isTimelineRecording && (
                                                                <div className="flex items-center w-full max-w-[320px] mx-auto relative h-[60px]">
                                                                    <button
                                                                        type="button"
                                                                        onClick={isPaused ? resumeRecording : pauseRecording}
                                                                        className="absolute left-0 z-10 w-[60px] h-[60px] bg-[#FF3B30] hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/40 transition-colors cursor-pointer"
                                                                        title={isPaused ? "Resume Recording" : "Pause Recording"}
                                                                    >
                                                                        {isPaused ? <Play className="text-white fill-current ml-1" size={24} /> : <Pause className="text-white fill-current" size={24} />}
                                                                    </button>

                                                                    <div className="ml-7 bg-[#FF3B30] h-[48px] w-full rounded-r-full flex items-center pl-10 pr-2 justify-between gap-[3px] shadow-sm overflow-hidden animate-fade-in-right">
                                                                        <div className="flex items-center gap-1.5 text-white font-mono text-sm ml-1">
                                                                            <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-white animate-pulse'}`} />
                                                                            {formatTimer(recordingTime)}
                                                                        </div>

                                                                        <div className="flex items-center justify-between gap-[3px] h-full flex-1 mx-2 overflow-hidden">
                                                                            {visualizerData.map((h, i) => (
                                                                                <div
                                                                                    key={i}
                                                                                    className={`w-[3px] rounded-full transition-all duration-150 ${isPaused ? 'bg-white/40' : 'bg-white'}`}
                                                                                    style={{ height: `${isPaused ? 15 : h}%` }}
                                                                                />
                                                                            ))}
                                                                        </div>

                                                                        <button
                                                                            type="button"
                                                                            onClick={stopRecording}
                                                                            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors flex-shrink-0 mr-1"
                                                                            title="Finish Recording"
                                                                        >
                                                                            <Square className="text-white fill-current" size={12} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Recorded Audio Studio Player & Timeline Punch-In Overwrite */}
                                                            {audioPreviewUrl && (!isRecording || isTimelineRecording) && (
                                                                <div className="w-full max-w-lg mx-auto space-y-4">
                                                                    {/* Custom Red Pill Audio Player UI */}
                                                                    <div
                                                                        onClick={togglePlayPause}
                                                                        className="flex items-center w-full max-w-[320px] mx-auto relative h-[60px] cursor-pointer hover:scale-[1.02] transition-transform"
                                                                        title="Click to Play/Pause"
                                                                    >
                                                                        <audio
                                                                            ref={audioElementRef}
                                                                            src={audioPreviewUrl}
                                                                            className="hidden"
                                                                            onLoadedMetadata={() => {
                                                                                if (audioElementRef.current) setAudioDuration(audioElementRef.current.duration || 0);
                                                                            }}
                                                                            onTimeUpdate={() => {
                                                                                if (audioElementRef.current) setSeekTime(audioElementRef.current.currentTime || 0);
                                                                            }}
                                                                        />
                                                                        <div className="absolute left-0 z-10 w-[60px] h-[60px] bg-[#FF3B30] rounded-full flex items-center justify-center shadow-lg shadow-red-500/40">
                                                                            {isPlaying ? <Pause className="text-white fill-current" size={24} /> : <Play className="text-white fill-current ml-1" size={24} />}
                                                                        </div>
                                                                        <div className="ml-7 bg-[#FF3B30] h-[48px] w-full rounded-r-full flex items-center pl-10 pr-6 justify-between gap-[3px] shadow-sm overflow-hidden">
                                                                            {new Array(35).fill(10).map((_, i) => {
                                                                                const peakIdx = Math.floor((i / 35) * (waveformPeaks.length || 35));
                                                                                const heightPercent = waveformPeaks.length > 0 ? waveformPeaks[peakIdx] : (Math.sin(i * 0.8) * 30 + 50);
                                                                                const progressPercent = audioDuration > 0 ? seekTime / audioDuration : 0;
                                                                                const isActive = (i / 35) <= progressPercent;
                                                                                return (
                                                                                    <div
                                                                                        key={i}
                                                                                        className={`w-[3px] rounded-full transition-all duration-150 ${isActive ? 'bg-white' : 'bg-white/40'}`}
                                                                                        style={{ height: `${heightPercent}%` }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>

                                                                    {/* Toggle Button for CapCut Visual Editor */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setShowTimelineEditor(!showTimelineEditor)}
                                                                        className="w-full bg-[#0B1E26] hover:bg-teal-950 text-teal-300 border border-teal-800/40 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow transition-all cursor-pointer"
                                                                    >
                                                                        {showTimelineEditor ? 'Hide Editor' : 'Edit or Voice over'}
                                                                    </button>

                                                                    {/* CapCut Visual Multi-Track Timeline Studio Drawer */}
                                                                    {showTimelineEditor && (
                                                                        <div className="bg-[#050D10] p-4.5 rounded-2xl border border-teal-500/40 shadow-2xl space-y-4 transition-all">
                                                                            {/* Top Control Toolbar with Edit Icon */}
                                                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/40 pb-3">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
                                                                                        <Edit3 size={15} />
                                                                                    </div>
                                                                                </div>

                                                                                {/* Action Bar (Icons Only in One Line) */}
                                                                                <div className="flex items-center gap-2">
                                                                                    {/* PLAY / PAUSE BUTTON */}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={togglePlayPause}
                                                                                        className="bg-teal-600 hover:bg-teal-500 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow transition-all cursor-pointer"
                                                                                        title="Play or Pause audio (Shortcut: Spacebar)"
                                                                                    >
                                                                                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                                                                    </button>

                                                                                    {/* RECORD VOICE-OVER */}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={startTimelineRecording}
                                                                                        className={`${isTimelineRecording ? 'bg-red-500 animate-pulse' : 'bg-red-600 hover:bg-red-500'} text-white w-8 h-8 rounded-lg flex items-center justify-center shadow transition-all cursor-pointer`}
                                                                                        title={isTimelineRecording ? "Stop Recording" : "Record Voice-Over at playhead"}
                                                                                    >
                                                                                        {isTimelineRecording ? <Square size={12} className="fill-current" /> : <Mic size={14} />}
                                                                                    </button>

                                                                                    {/* CUT / SPLIT AT PLAYHEAD */}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={splitClipAtPlayhead}
                                                                                        className="bg-teal-600 hover:bg-teal-500 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow transition-all cursor-pointer"
                                                                                        title="Cut clip at playhead"
                                                                                    >
                                                                                        <Scissors size={14} />
                                                                                    </button>

                                                                                    {/* ZOOM CONTROLS */}
                                                                                    <div className="flex items-center gap-1 ml-2 border-l border-teal-900/40 pl-2">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setTimelineZoom(prev => Math.max(1, prev - 0.5))}
                                                                                            className="bg-[#0B1E26] hover:bg-teal-900/50 text-teal-300 w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer border border-teal-900/40"
                                                                                            title="Zoom Out (Ctrl -)"
                                                                                        >
                                                                                            <ZoomOut size={13} />
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setTimelineZoom(prev => Math.min(5, prev + 0.5))}
                                                                                            className="bg-[#0B1E26] hover:bg-teal-900/50 text-teal-300 w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer border border-teal-900/40"
                                                                                            title="Zoom In (Ctrl +)"
                                                                                        >
                                                                                            <ZoomIn size={13} />
                                                                                        </button>
                                                                                        {timelineZoom !== 1 && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setTimelineZoom(1)}
                                                                                                className="bg-[#0B1E26] hover:bg-teal-900/50 text-teal-300 w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer border border-teal-900/40"
                                                                                                title="Reset Zoom"
                                                                                            >
                                                                                                <Minimize2 size={13} />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            {/* Playhead Info Row */}
                                                                            <div className="flex items-center justify-between px-1 mb-2">
                                                                                <div className="text-[10px] font-mono text-teal-400">
                                                                                    Playhead: {formatTimer(seekTime)} / {formatTimer(audioDuration)}
                                                                                </div>
                                                                            </div>

                                                                            {/* Multi-Track Timeline Box */}

                                                                            <div className="space-y-2 text-left">
                                                                                {/* Scrollable Timeline Wrapper */}
                                                                                <div
                                                                                    ref={timelineScrollRef}
                                                                                    className="overflow-x-auto overflow-y-hidden rounded-xl border border-teal-900/60 bg-[#08181F] shadow-inner custom-scrollbar"
                                                                                    style={{ maxHeight: '160px' }}
                                                                                >
                                                                                    {/* Interactive Timeline Canvas spanning both tracks */}
                                                                                    <div
                                                                                        ref={timelineTrackRef}
                                                                                        onMouseDown={handleTimelineMouseDown}
                                                                                        className="relative cursor-pointer select-none group space-y-1 p-1"
                                                                                        style={{ minWidth: `${timelineZoom * 100}%` }}
                                                                                    >
                                                                                        {/* TRACK 1: MAIN AUDIO TRACK */}
                                                                                        <div className="relative h-14 bg-[#051116] rounded-lg border border-teal-900/40 overflow-hidden flex items-center px-2">
                                                                                            {/* Render Main Audio Clips (Movable with internal waveform peaks & per-clip crop handles) */}
                                                                                            {audioDuration > 0 && mainClips.map((clip, idx) => {
                                                                                                if (clip.isDeleted) return null;
                                                                                                const leftPercent = (clip.start / audioDuration) * 100;
                                                                                                const widthPercent = ((clip.end - clip.start) / audioDuration) * 100;
                                                                                                const isSelected = selectedClipId === clip.id;

                                                                                                // Slice peak waveform for this clip's source PCM region so waveform moves WITH the clip box!
                                                                                                const totalPeaks = waveformPeaks.length > 0 ? waveformPeaks.length : 72;
                                                                                                const srcStart = clip.sourceStart !== undefined ? clip.sourceStart : clip.start;
                                                                                                const srcEnd = srcStart + (clip.end - clip.start);
                                                                                                const startIdx = Math.max(0, Math.floor((srcStart / audioDuration) * totalPeaks));
                                                                                                const endIdx = Math.min(totalPeaks, Math.max(startIdx + 4, Math.ceil((srcEnd / audioDuration) * totalPeaks)));
                                                                                                const clipPeaks = (waveformPeaks.length > 0 ? waveformPeaks : Array.from({ length: 72 }).map(() => 45)).slice(startIdx, endIdx);

                                                                                                return (
                                                                                                    <div
                                                                                                        key={clip.id}
                                                                                                        onMouseDown={(e) => handleClipMouseDown(e, clip)}
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            setSelectedClipId(clip.id);
                                                                                                            setSelectedTrack('main');
                                                                                                        }}
                                                                                                        className={`absolute top-1 bottom-1 rounded-lg border-2 flex items-center justify-between px-2 transition-all cursor-grab active:cursor-grabbing z-10 overflow-hidden ${isSelected
                                                                                                            ? 'bg-teal-500/50 border-teal-400 shadow-[0_0_14px_rgba(20,184,166,0.7)] text-white ring-2 ring-teal-300'
                                                                                                            : 'bg-teal-950/90 border-teal-800/80 hover:border-teal-400 text-teal-200'
                                                                                                            }`}
                                                                                                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                                                                                        title="Drag clip to move. Drag left/right handle edges to crop/trim clip."
                                                                                                    >
                                                                                                        {/* Left Edge Crop Handle */}
                                                                                                        <div
                                                                                                            onMouseDown={(e) => handleClipTrimMouseDown(e, clip, 'start')}
                                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                                            className="absolute left-0 top-0 bottom-0 w-2 bg-teal-400 hover:bg-white cursor-ew-resize z-30 flex items-center justify-center transition-colors group/leftTrim"
                                                                                                            title="Drag left edge to crop/trim start"
                                                                                                        >
                                                                                                            <div className="w-0.5 h-3.5 bg-teal-950 rounded-full" />
                                                                                                        </div>

                                                                                                        {/* Waveform Peaks INSIDE the clip box so voice moves WITH the clip! */}
                                                                                                        <div className="absolute inset-0 flex items-center justify-between px-2 opacity-40 pointer-events-none z-0">
                                                                                                            {clipPeaks.map((height, i) => (
                                                                                                                <div
                                                                                                                    key={i}
                                                                                                                    className="w-0.5 bg-teal-300 rounded-full"
                                                                                                                    style={{ height: `${height}%` }}
                                                                                                                />
                                                                                                            ))}
                                                                                                        </div>

                                                                                                        <div className="flex items-center gap-1 text-[10px] font-bold truncate pointer-events-none z-10 pl-1.5">
                                                                                                            <Move size={11} className="text-teal-400/90 flex-shrink-0" />
                                                                                                            <span className="truncate">{clip.name || `Main Clip #${idx + 1}`} ({formatTimer(clip.start)} - {formatTimer(clip.end)})</span>
                                                                                                        </div>
                                                                                                        {isSelected && (
                                                                                                            <div className="flex items-center gap-1 z-20 mr-1.5">
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={(e) => {
                                                                                                                        e.stopPropagation();
                                                                                                                        deleteSelectedClip();
                                                                                                                    }}
                                                                                                                    className="p-1 bg-red-600 hover:bg-red-500 text-white rounded cursor-pointer transition-colors shadow flex items-center justify-center"
                                                                                                                    title="Delete this selected clip piece (Or press Delete / Backspace key)"
                                                                                                                >
                                                                                                                    <Trash2 size={10} />
                                                                                                                </button>
                                                                                                                <span className="text-[8px] bg-teal-600 px-1 py-0.5 rounded font-bold uppercase tracking-wider text-white pointer-events-none">
                                                                                                                    Selected
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        )}

                                                                                                        {/* Right Edge Crop Handle */}
                                                                                                        <div
                                                                                                            onMouseDown={(e) => handleClipTrimMouseDown(e, clip, 'end')}
                                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                                            className="absolute right-0 top-0 bottom-0 w-2 bg-teal-400 hover:bg-white cursor-ew-resize z-30 flex items-center justify-center transition-colors group/rightTrim"
                                                                                                            title="Drag right edge to crop/trim end"
                                                                                                        >
                                                                                                            <div className="w-0.5 h-3.5 bg-teal-950 rounded-full" />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}

                                                                                            {/* Auto-Mute Red Indicator overlay on Track 1 where Voice-Over exists on Track 2 */}
                                                                                            {audioDuration > 0 && voiceoverClips.map(vo => {
                                                                                                if (vo.isDeleted) return null;
                                                                                                const leftPercent = (vo.start / audioDuration) * 100;
                                                                                                const widthPercent = ((vo.end - vo.start) / audioDuration) * 100;
                                                                                                return (
                                                                                                    <div
                                                                                                        key={`silenced-${vo.id}`}
                                                                                                        className="absolute top-0 bottom-0 bg-red-950/80 border-x-2 border-red-500/80 flex items-center justify-center pointer-events-none z-15 shadow-inner"
                                                                                                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                                                                                    >
                                                                                                        <span className="text-[9px] font-bold text-red-300 uppercase tracking-tight bg-black/80 px-1.5 py-0.5 rounded border border-red-800 truncate shadow">
                                                                                                            Muted by Voice-Over
                                                                                                        </span>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>

                                                                                        {/* TRACK 2: VOICE-OVER TRACK */}
                                                                                        <div className="relative h-14 bg-[#140F08] rounded-lg border border-amber-900/40 overflow-hidden flex items-center px-2">
                                                                                            {/* Render Voice-Over Clips (Movable with internal waveform & per-clip crop handles) */}
                                                                                            {audioDuration > 0 && voiceoverClips.map((vo, idx) => {
                                                                                                if (vo.isDeleted) return null;
                                                                                                const leftPercent = (vo.start / audioDuration) * 100;
                                                                                                const widthPercent = ((vo.end - vo.start) / audioDuration) * 100;
                                                                                                const isSelected = selectedClipId === vo.id;
                                                                                                const voPeaks = Array.from({ length: 24 }).map((_, i) => Math.sin(i * 0.5) * 35 + 45);

                                                                                                return (
                                                                                                    <div
                                                                                                        key={vo.id}
                                                                                                        onMouseDown={(e) => handleClipMouseDown(e, vo)}
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            setSelectedClipId(vo.id);
                                                                                                            setSelectedTrack('voiceover');
                                                                                                        }}
                                                                                                        className={`absolute top-1 bottom-1 rounded-lg border-2 flex items-center justify-between px-2 transition-all cursor-grab active:cursor-grabbing z-10 overflow-hidden ${isSelected
                                                                                                            ? 'bg-amber-500/60 border-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.8)] text-white ring-2 ring-amber-300'
                                                                                                            : 'bg-amber-950/90 border-amber-600/80 hover:border-amber-400 text-amber-200'
                                                                                                            }`}
                                                                                                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                                                                                        title="Drag clip to move. Drag left/right handle edges to crop/trim clip."
                                                                                                    >
                                                                                                        {/* Left Edge Crop Handle */}
                                                                                                        <div
                                                                                                            onMouseDown={(e) => handleClipTrimMouseDown(e, vo, 'start')}
                                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                                            className="absolute left-0 top-0 bottom-0 w-2 bg-amber-400 hover:bg-white cursor-ew-resize z-30 flex items-center justify-center transition-colors group/leftTrim"
                                                                                                            title="Drag left edge to crop/trim start"
                                                                                                        >
                                                                                                            <div className="w-0.5 h-3.5 bg-amber-950 rounded-full" />
                                                                                                        </div>

                                                                                                        {/* Waveform Peaks INSIDE Voice-Over Clip Box */}
                                                                                                        <div className="absolute inset-0 flex items-center justify-between px-2 opacity-40 pointer-events-none z-0">
                                                                                                            {voPeaks.map((height, i) => (
                                                                                                                <div
                                                                                                                    key={i}
                                                                                                                    className="w-0.5 bg-amber-400 rounded-full"
                                                                                                                    style={{ height: `${height}%` }}
                                                                                                                />
                                                                                                            ))}
                                                                                                        </div>

                                                                                                        <div className="flex items-center gap-1 text-[10px] font-bold truncate pointer-events-none z-10 pl-1.5">
                                                                                                            <Move size={11} className="text-amber-400/90 flex-shrink-0" />
                                                                                                            <Mic size={11} className="text-amber-400 flex-shrink-0" />
                                                                                                            <span className="truncate">{vo.name || `Voice-Over #${idx + 1}`} ({formatTimer(vo.start)} - {formatTimer(vo.end)})</span>
                                                                                                        </div>
                                                                                                        {isSelected && (
                                                                                                            <div className="flex items-center gap-1 z-20 mr-1.5">
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={(e) => {
                                                                                                                        e.stopPropagation();
                                                                                                                        deleteSelectedClip();
                                                                                                                    }}
                                                                                                                    className="p-1 bg-red-600 hover:bg-red-500 text-white rounded cursor-pointer transition-colors shadow flex items-center justify-center"
                                                                                                                    title="Delete this selected clip piece (Or press Delete / Backspace key)"
                                                                                                                >
                                                                                                                    <Trash2 size={10} />
                                                                                                                </button>
                                                                                                                <span className="text-[8px] bg-amber-600 px-1 py-0.5 rounded font-bold uppercase tracking-wider text-white pointer-events-none">
                                                                                                                    Selected
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        )}

                                                                                                        {/* Right Edge Crop Handle */}
                                                                                                        <div
                                                                                                            onMouseDown={(e) => handleClipTrimMouseDown(e, vo, 'end')}
                                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                                            className="absolute right-0 top-0 bottom-0 w-2 bg-amber-400 hover:bg-white cursor-ew-resize z-30 flex items-center justify-center transition-colors group/rightTrim"
                                                                                                            title="Drag right edge to crop/trim end"
                                                                                                        >
                                                                                                            <div className="w-0.5 h-3.5 bg-amber-950 rounded-full" />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>

                                                                                        {/* Red Playhead Vertical Indicator Across Both Tracks */}
                                                                                        {audioDuration > 0 && (
                                                                                            <div
                                                                                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,1)]"
                                                                                                style={{ left: `${(seekTime / audioDuration) * 100}%` }}
                                                                                            >
                                                                                                <div className="w-2.5 h-2.5 bg-red-500 rounded-full -translate-x-[4px] -translate-y-1 border border-white" />
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div> {/* end scrollable wrapper */}
                                                                            </div>

                                                                            {/* Footer Save & Stitch Bar */}
                                                                            <div className="pt-2 border-t border-teal-900/40 flex items-center justify-end">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={applyStitchingAndSave}
                                                                                    className="bg-teal-600 hover:bg-teal-500 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-600/30 transition-all cursor-pointer"
                                                                                >
                                                                                    <Check size={15} /> Save
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        onClick={clearAudio}
                                                                        className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center justify-center gap-1.5 mx-auto pt-1"
                                                                    >
                                                                        <RotateCcw size={14} /> Delete & Record New Audio
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Alternative Audio Upload */}
                                                    {!audioBlob && !audioPreviewUrl && !isRecording && !isPaused && (
                                                        <div className="pt-4 border-t border-teal-900/30 flex items-center justify-between">
                                                            <span className="text-xs text-slate-400">Or select an existing audio file:</span>
                                                            <label className="bg-[#0B1E26] hover:bg-teal-950/60 text-teal-300 border border-teal-800/40 text-xs px-3.5 py-2 rounded-lg font-semibold cursor-pointer transition-colors flex items-center gap-1.5">
                                                                <Upload size={14} /> Choose Audio File
                                                                <input type="file" accept="audio/*" onChange={handleAudioFileUpload} className="hidden" />
                                                            </label>
                                                        </div>
                                                    )}
                                                                                                </div>
        </div>
           </div>
    );
};
