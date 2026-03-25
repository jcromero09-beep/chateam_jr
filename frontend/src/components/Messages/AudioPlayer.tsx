import React, { useRef, useState, useEffect } from 'react'
import { Box, IconButton, Typography, Chip } from '@mui/joy'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'

interface AudioPlayerProps {
  src: string
  isDark: boolean
  isOwn: boolean
  ack?: number
}

// Genera alturas deterministas para las barras de waveform
function generateWaveform(src: string, bars: number): number[] {
  let hash = 0
  for (let i = 0; i < src.length; i++) {
    hash = (hash * 31 + src.charCodeAt(i)) >>> 0
  }
  const heights: number[] = []
  for (let i = 0; i < bars; i++) {
    // Mezclar hash con índice paravariación
    const seed = (hash * (i + 1) * 2654435761) >>> 0
    heights.push(4 + (seed % 17)) // 4-20px
  }
  return heights
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [1, 1.5, 2]

export default function AudioPlayer({ src, isDark, isOwn, ack }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(0)
  const [clickedBar, setClickedBar] = useState<number | null>(null)

  const waveform = generateWaveform(src, 40)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
  }

  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) return
    setDuration(audio.duration)
  }

  const handleEnded = () => {
    setPlaying(false)
    setCurrentTime(0)
  }

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(next)
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[next]
    }
  }

  const handleWaveformClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const newTime = ratio * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
    // Highlight the clicked bar briefly
    const barIndex = Math.floor(ratio * 40)
    setClickedBar(barIndex)
    setTimeout(() => setClickedBar(null), 200)
  }

  const accentColor = isOwn
    ? (ack !== undefined && ack >= 3 ? '#5BC2D2' : '#25D366')
    : (isDark ? '#5BC2D2' : '#00A884')

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: '220px', maxWidth: '330px' }}>
      {/* Audio real (hidden) */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Play/Pause button */}
      <IconButton
        onClick={togglePlay}
        size="sm"
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          bgcolor: accentColor,
          color: '#fff',
          flexShrink: 0,
          '&:hover': { bgcolor: accentColor, opacity: 0.85 },
        }}
      >
        {playing ? (
          <PauseIcon sx={{ fontSize: 18 }} />
        ) : (
          <PlayArrowIcon sx={{ fontSize: 18, ml: '2px' }} />
        )}
      </IconButton>

      {/* Waveform + info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Waveform SVG */}
        <Box
          component="svg"
          viewBox="0 0 200 24"
          sx={{
            width: '100%',
            height: '24px',
            cursor: 'pointer',
            mb: 0.5,
            display: 'block',
          }}
          onClick={handleWaveformClick}
        >
          {waveform.map((h, i) => {
            const x = (i / 40) * 200
            const w = 200 / 40 - 1
            const isPlayed = (i / 40) * 100 < progress
            const isClicked = clickedBar === i
            return (
              <Box
                key={i}
                component="rect"
                x={x}
                y={(24 - h) / 2}
                width={w}
                height={h}
                rx={1}
                fill={isPlayed ? accentColor : isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}
                sx={{
                  transition: 'fill 0.1s',
                  ...(isClicked ? { fill: accentColor } : {}),
                }}
              />
            )
          })}
        </Box>

        {/* Duración */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography level="body-xs" sx={{ color: isDark ? '#8A8D91' : '#65676B' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Typography>
          <Chip
            size="sm"
            variant="outlined"
            onClick={cycleSpeed}
            sx={{
              height: 18,
              fontSize: '10px',
              cursor: 'pointer',
              borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
              color: isDark ? '#8A8D91' : '#65676B',
            }}
          >
            {SPEEDS[speedIndex]}x
          </Chip>
        </Box>
      </Box>
    </Box>
  )
}
