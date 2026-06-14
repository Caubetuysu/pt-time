/* ==========================================================================
   ZenTime JS Application Logic (Refactored for Backend with LocalStorage Fallback)
   ========================================================================== */

// --- Global API Configuration ---
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api';
let backendOffline = false;

// --- Global Playlists Configuration ---
const playlists = [
    { type: 'live', id: 'jfKfPfyJRdk', title: 'Lofi Girl Live Radio' },
    { type: 'live', id: '7NOSDKb0HGQ', title: 'Chillhop Live Radio' },
    { type: 'playlist', id: 'PLw717l4Vd8p45-F7v8uY4f2N0M2jR8YfF', title: 'Ambient Code & Focus' },
    { type: 'playlist', id: 'PL3oW2tjiIxvSpY1Y7F65t254yqPzN3Rz3', title: 'Synthwave Study Session' }
];

// --- Application State ---
let totalDurationSeconds = 25 * 60; // Default Pomodoro 25 mins
let secondsRemaining = totalDurationSeconds;
let timerState = 'idle'; // 'idle', 'running', 'paused'
let timerMode = 'focus'; // 'focus', 'break', 'ielts'
let selectedSubject = 'Chưa chọn';

// Timer drift correction variables
let timerInterval = null;
let startTime = null;
let elapsedBeforePause = 0;

// Web Audio API State
let audioContext = null;
let rainNode = null;
let rainGainNode = null;

// YouTube Player State
let ytPlayer = null;
let ytPlayerReady = false;

// --- DOM Elements ---
const subjectSelect = document.getElementById('subject-select');
const newSubjectForm = document.getElementById('new-subject-form');
const newSubjectInput = document.getElementById('new-subject-input');
const saveSubjectBtn = document.getElementById('save-subject-btn');
const cancelSubjectBtn = document.getElementById('cancel-subject-btn');

const timerStateBadge = document.getElementById('timer-state-badge');
const timerCircleProgress = document.getElementById('timer-circle-progress');
const timerSubjectDisplay = document.getElementById('timer-subject-display');
const timerClock = document.getElementById('timer-clock');
const timerSublabel = document.getElementById('timer-sublabel');

const playPauseBtn = document.getElementById('play-pause-btn');
const playPauseText = document.getElementById('play-pause-text');
const resetBtn = document.getElementById('reset-btn');

const customMinutesInput = document.getElementById('custom-minutes-input');
const applyCustomBtn = document.getElementById('apply-custom-btn');

const playlistSelect = document.getElementById('playlist-select');
const ytPlayBtn = document.getElementById('yt-play-btn');
const ytPrevBtn = document.getElementById('yt-prev-btn');
const ytNextBtn = document.getElementById('yt-next-btn');
const ytVolumeSlider = document.getElementById('yt-volume');
const ytVolumePercent = document.getElementById('yt-volume-percent');

const rainToggle = document.getElementById('rain-toggle');
const rainVolumeSlider = document.getElementById('rain-volume');
const rainVolumePercent = document.getElementById('rain-volume-percent');

const totalSessionsEl = document.getElementById('total-focus-sessions');
const totalTimeEl = document.getElementById('total-focus-time');
const subjectChartEl = document.getElementById('subject-chart');
const sessionLogsListEl = document.getElementById('session-logs-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Circle Circumference
const CIRCLE_CIRCUMFERENCE = 597;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initSubjects();
    initTimerUI();
    initEventListeners();
    updateDashboard();
    initTabs();
    initDocuments();
    initCourses();
});

// --- Subject Management ---
async function initSubjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/subjects`);
        if (!response.ok) throw new Error('Backend response not OK');
        const subjects = await response.json();
        
        backendOffline = false;
        // Keep LocalStorage updated
        localStorage.setItem('zentime_subjects', JSON.stringify(subjects));
        renderSubjectDropdown(subjects);
    } catch (error) {
        console.warn('API Server is offline. Falling back to LocalStorage.', error);
        backendOffline = true;
        
        let savedSubjects = localStorage.getItem('zentime_subjects');
        if (!savedSubjects) {
            savedSubjects = ['Toán', 'Văn', 'Anh', 'Code', 'IELTS'];
            localStorage.setItem('zentime_subjects', JSON.stringify(savedSubjects));
        } else {
            savedSubjects = JSON.parse(savedSubjects);
        }
        renderSubjectDropdown(savedSubjects);
    }
}

function renderSubjectDropdown(subjects) {
    // Clear dynamic options (index 1 to length - 2)
    while (subjectSelect.options.length > 2) {
        subjectSelect.remove(1);
    }
    
    // Add subjects before "+ Thêm môn học..."
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject === 'IELTS' ? 'IELTS Speaking' : subject;
        subjectSelect.insertBefore(option, subjectSelect.lastElementChild);
    });
}

// --- Timer UI Setup ---
function initTimerUI() {
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    
    // Format timer clocks: mm:ss
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    timerClock.textContent = `${formattedMinutes}:${formattedSeconds}`;
    
    // Document Title Update for background tracking
    const modeIndicator = timerMode === 'focus' ? '🎯' : (timerMode === 'ielts' ? '🗣️' : '☕');
    document.title = `${formattedMinutes}:${formattedSeconds} ${modeIndicator} PT Time`;

    // Circular progress stroke calculation
    const progressOffset = CIRCLE_CIRCUMFERENCE * (1 - (secondsRemaining / totalDurationSeconds));
    timerCircleProgress.style.strokeDashoffset = progressOffset;
}

// --- Event Listeners ---
function initEventListeners() {
    // Subject selector
    subjectSelect.addEventListener('change', (e) => {
        if (e.target.value === 'add-new') {
            newSubjectForm.classList.remove('hidden');
            newSubjectInput.focus();
        } else {
            selectedSubject = e.target.value;
            timerSubjectDisplay.textContent = selectedSubject === 'Chưa chọn' ? 'Chưa chọn môn' : selectedSubject;
            newSubjectForm.classList.add('hidden');
        }
    });

    saveSubjectBtn.addEventListener('click', saveCustomSubject);
    newSubjectInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveCustomSubject();
    });

    cancelSubjectBtn.addEventListener('click', () => {
        newSubjectForm.classList.add('hidden');
        subjectSelect.value = selectedSubject;
    });

    // Main Timer Buttons
    playPauseBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Preset Selection
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.preset-btn').forEach(p => p.classList.remove('active'));
            
            const target = e.currentTarget;
            target.classList.add('active');
            
            const minutes = parseInt(target.getAttribute('data-minutes'));
            const mode = target.getAttribute('data-mode');
            
            setTimerPreset(minutes, mode);
        });
    });

    // Custom minutes apply
    applyCustomBtn.addEventListener('click', () => {
        const val = parseInt(customMinutesInput.value);
        if (val && val > 0 && val < 1000) {
            document.querySelectorAll('.preset-btn').forEach(p => p.classList.remove('active'));
            setTimerPreset(val, 'focus');
            customMinutesInput.value = '';
        }
    });

    // YouTube Audio Controllers
    ytPlayBtn.addEventListener('click', toggleYtPlay);
    ytPrevBtn.addEventListener('click', playPrevYt);
    ytNextBtn.addEventListener('click', playNextYt);
    playlistSelect.addEventListener('change', loadSelectedPlaylist);
    ytVolumeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        ytVolumePercent.textContent = `${val}%`;
        if (ytPlayerReady && ytPlayer) {
            ytPlayer.setVolume(val);
        }
    });

    // Web Audio Rain Noise Controllers
    rainToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            rainVolumeSlider.removeAttribute('disabled');
            initRainSound();
        } else {
            rainVolumeSlider.setAttribute('disabled', 'true');
            stopRainSound();
        }
    });

    rainVolumeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        rainVolumePercent.textContent = `${val}%`;
        setRainVolume(val);
    });

    // Clear history logs
    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử phiên học?')) {
            if (!backendOffline) {
                try {
                    const response = await fetch(`${API_BASE_URL}/sessions`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) throw new Error('Could not delete sessions on server');
                    updateDashboard();
                    return;
                } catch (error) {
                    console.warn('Failed to delete history on backend API, clearing locally.', error);
                    backendOffline = true;
                }
            }
            
            // Local fallback
            localStorage.removeItem('zentime_history');
            updateDashboard();
        }
    });
}

async function saveCustomSubject() {
    const val = newSubjectInput.value.trim();
    if (!val) return;
    
    if (!backendOffline) {
        try {
            const response = await fetch(`${API_BASE_URL}/subjects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: val })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Server error');
            }
            const updatedSubjects = await response.json();
            
            localStorage.setItem('zentime_subjects', JSON.stringify(updatedSubjects));
            renderSubjectDropdown(updatedSubjects);
            
            selectedSubject = val;
            subjectSelect.value = val;
            timerSubjectDisplay.textContent = val;
            newSubjectInput.value = '';
            newSubjectForm.classList.add('hidden');
            return;
        } catch (error) {
            console.warn('Could not POST new subject to backend API. Saving locally.', error);
            backendOffline = true;
        }
    }
    
    // Local fallback
    let savedSubjects = JSON.parse(localStorage.getItem('zentime_subjects') || '[]');
    if (!savedSubjects.includes(val)) {
        savedSubjects.push(val);
        localStorage.setItem('zentime_subjects', JSON.stringify(savedSubjects));
    }
    renderSubjectDropdown(savedSubjects);
    selectedSubject = val;
    subjectSelect.value = val;
    timerSubjectDisplay.textContent = val;
    newSubjectInput.value = '';
    newSubjectForm.classList.add('hidden');
}

function setTimerPreset(minutes, mode) {
    if (timerState === 'running') {
        if (!confirm('Bạn có muốn dừng phiên hiện tại để đổi mốc thời gian?')) {
            return;
        }
        pauseTimer();
    }
    
    totalDurationSeconds = minutes * 60;
    secondsRemaining = totalDurationSeconds;
    timerMode = mode;
    elapsedBeforePause = 0;
    
    // Update Badge & UI theme colors
    updateBadgeTheme(mode);
    updateTimerDisplay();
}

function updateBadgeTheme(mode) {
    timerStateBadge.className = 'timer-badge';
    
    if (mode === 'focus') {
        timerStateBadge.textContent = 'Đang tập trung';
        timerStateBadge.classList.add('status-focus');
        timerCircleProgress.style.stroke = 'var(--neon-cyan)';
        
        // Auto select IELTS if mode is IELTS, else let user select
        if (selectedSubject === 'IELTS') {
            selectedSubject = 'Chưa chọn';
            subjectSelect.value = 'Chưa chọn';
            timerSubjectDisplay.textContent = 'Chưa chọn môn';
        }
    } else if (mode === 'break') {
        timerStateBadge.textContent = 'Nghỉ giải lao';
        timerStateBadge.classList.add('status-break');
        timerCircleProgress.style.stroke = 'var(--neon-pink)';
    } else if (mode === 'ielts') {
        timerStateBadge.textContent = 'IELTS Speaking';
        timerStateBadge.classList.add('status-focus');
        timerCircleProgress.style.stroke = 'var(--neon-cyan)';
        
        // Auto select IELTS subject
        selectedSubject = 'IELTS';
        subjectSelect.value = 'IELTS';
        timerSubjectDisplay.textContent = 'IELTS Speaking';
    }
    
    // Update button color scheme
    updateControlBtnStyles();
}

function updateControlBtnStyles() {
    playPauseBtn.className = 'btn-control btn-play';
    if (timerState === 'running') {
        if (timerMode === 'focus' || timerMode === 'ielts') {
            playPauseBtn.classList.add('focus-active');
        } else {
            playPauseBtn.classList.add('break-active');
        }
    }
}

// --- High-Precision Timer Engine ---
function toggleTimer() {
    // Resume browser audio contexts on initial interaction
    resumeAudioContexts();

    if (timerState === 'running') {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    timerState = 'running';
    startTime = Date.now();
    
    // Swap Play/Pause button icons
    playPauseBtn.querySelector('.icon-play').classList.add('hidden');
    playPauseBtn.querySelector('.icon-pause').classList.remove('hidden');
    playPauseText.textContent = 'Tạm dừng';
    
    updateControlBtnStyles();
    
    // Accurate Timer loop (compensated for background tab delays)
    timerInterval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000) + elapsedBeforePause;
        secondsRemaining = Math.max(0, totalDurationSeconds - elapsedSeconds);
        
        updateTimerDisplay();
        
        if (secondsRemaining <= 0) {
            timerCompleted();
        }
    }, 100);
    
    timerSublabel.textContent = timerMode === 'focus' ? 'Tập trung học tập...' : (timerMode === 'break' ? 'Nghỉ ngơi thư giãn...' : 'Luyện IELTS Speaking...');
}

function pauseTimer() {
    if (timerState !== 'running') return;
    
    timerState = 'paused';
    elapsedBeforePause += Math.floor((Date.now() - startTime) / 1000);
    clearInterval(timerInterval);
    
    // Swap Play/Pause icons
    playPauseBtn.querySelector('.icon-play').classList.remove('hidden');
    playPauseBtn.querySelector('.icon-pause').classList.add('hidden');
    playPauseText.textContent = 'Tiếp tục';
    
    updateControlBtnStyles();
    timerSublabel.textContent = 'Đã tạm dừng';
}

function resetTimer() {
    clearInterval(timerInterval);
    timerState = 'idle';
    elapsedBeforePause = 0;
    secondsRemaining = totalDurationSeconds;
    
    // Restore button icons
    playPauseBtn.querySelector('.icon-play').classList.remove('hidden');
    playPauseBtn.querySelector('.icon-pause').classList.add('hidden');
    playPauseText.textContent = 'Bắt đầu';
    
    updateControlBtnStyles();
    updateTimerDisplay();
    timerSublabel.textContent = 'Sẵn sàng để bắt đầu';
}

function timerCompleted() {
    clearInterval(timerInterval);
    timerState = 'idle';
    
    // Play beautiful synthetic sound
    playAlarmSound();
    
    // Log the session if it is a study session (focus or ielts)
    if (timerMode === 'focus' || timerMode === 'ielts') {
        logSession();
    }
    
    // Auto transition logic
    let nextMode = 'break';
    let nextMinutes = 5;
    
    if (timerMode === 'break') {
        nextMode = 'focus';
        nextMinutes = 25;
        alert('Hết giờ nghỉ! Bắt đầu học tập nào.');
    } else {
        alert('Chúc mừng bạn đã hoàn thành phiên học tập!');
    }
    
    // Set to new preset
    setTimerPreset(nextMinutes, nextMode);
}

// --- Synthesis Sound (Web Audio API Chime) ---
function playAlarmSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        
        const playTone = (frequency, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, start);
            
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.2, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(start);
            osc.stop(start + duration);
        };
        
        // Beautiful Zen chime sequence (C Major Pentatonic)
        playTone(523.25, now, 1.0);        // C5
        playTone(587.33, now + 0.15, 1.0);  // D5
        playTone(659.25, now + 0.3, 1.0);   // E5
        playTone(783.99, now + 0.45, 1.2);  // G5
        playTone(880.00, now + 0.6, 1.5);   // A5
    } catch (e) {
        console.error('Không thể sinh âm thanh báo thức: ', e);
    }
}

// --- Web Audio Rain Noise Generator ---
function initRainSound() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        // Brownian noise generation algorithm for rain sound
        const bufferSize = 2 * audioContext.sampleRate;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 4.0; // Boost volume slightly
        }
        
        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        
        // Soft low frequency rumble
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(700, audioContext.currentTime);
        
        // Rain droplets peak frequencies
        const peakFilter = audioContext.createBiquadFilter();
        peakFilter.type = 'peaking';
        peakFilter.frequency.setValueAtTime(2200, audioContext.currentTime);
        peakFilter.Q.setValueAtTime(1.2, audioContext.currentTime);
        peakFilter.gain.setValueAtTime(5.0, audioContext.currentTime);
        
        // Gain Node
        rainGainNode = audioContext.createGain();
        const currentVol = parseFloat(rainVolumeSlider.value) / 100;
        rainGainNode.gain.setValueAtTime(currentVol * 0.4, audioContext.currentTime); // Volume scaling
        
        // Connections
        noiseSource.connect(lowpass);
        lowpass.connect(peakFilter);
        peakFilter.connect(rainGainNode);
        rainGainNode.connect(audioContext.destination);
        
        noiseSource.start(0);
        rainNode = noiseSource;
    } catch (e) {
        console.error('Không thể khởi động âm thanh mưa: ', e);
    }
}

function stopRainSound() {
    if (rainNode) {
        try {
            rainNode.stop();
        } catch (e) {}
        rainNode.disconnect();
        rainNode = null;
    }
}

function setRainVolume(val) {
    if (rainGainNode && audioContext) {
        const volumeVal = (parseFloat(val) / 100) * 0.4;
        rainGainNode.gain.setValueAtTime(volumeVal, audioContext.currentTime);
    }
}

function resumeAudioContexts() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// --- YouTube IFrame API Control ---
window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '180',
        width: '240',
        videoId: playlists[0].id,
        host: 'https://www.youtube.com',
        playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            origin: window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
};

function onPlayerReady(event) {
    ytPlayerReady = true;
    document.getElementById('current-track-status').innerText = 'Sẵn sàng phát nhạc';
    ytPlayer.setVolume(parseInt(ytVolumeSlider.value));
}

function onPlayerStateChange(event) {
    const statusText = document.getElementById('current-track-status');
    const titleText = document.getElementById('current-track-title');
    const vinyl = document.querySelector('.vinyl-record');
    
    // Play icons
    const iconPlay = ytPlayBtn.querySelector('.yt-icon-play');
    const iconPause = ytPlayBtn.querySelector('.yt-icon-pause');
    
    if (event.data === YT.PlayerState.PLAYING) {
        statusText.innerText = 'Đang phát nhạc Lofi...';
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
        vinyl.classList.add('playing');
        
        // Update Title if available
        if (ytPlayer.getVideoData) {
            const data = ytPlayer.getVideoData();
            if (data && data.title) {
                titleText.innerText = data.title;
            }
        }
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        statusText.innerText = 'Tạm dừng nhạc';
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
        vinyl.classList.remove('playing');
    } else if (event.data === YT.PlayerState.BUFFERING) {
        statusText.innerText = 'Đang tải đệm YouTube...';
    }
}

function onPlayerError(event) {
    console.warn('Lỗi YouTube Iframe code:', event.data);
    document.getElementById('current-track-status').innerText = 'Lỗi phát nhạc. Đang tự chuyển tiếp...';
    playNextYt();
}

function toggleYtPlay() {
    resumeAudioContexts();
    if (!ytPlayerReady || !ytPlayer) return;
    
    try {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            ytPlayer.pauseVideo();
        } else {
            ytPlayer.playVideo();
        }
    } catch(e) {
        loadSelectedPlaylist();
    }
}

function loadSelectedPlaylist() {
    resumeAudioContexts();
    if (!ytPlayerReady || !ytPlayer) return;
    
    const index = parseInt(playlistSelect.value);
    const item = playlists[index];
    
    document.getElementById('current-track-title').innerText = item.title;
    document.getElementById('current-track-status').innerText = 'Đang tải luồng...';
    
    if (item.type === 'live') {
        ytPlayer.loadVideoById(item.id);
    } else {
        ytPlayer.loadPlaylist({
            listType: 'playlist',
            list: item.id,
            index: 0
        });
    }
    
    // Auto play
    setTimeout(() => {
        try {
            ytPlayer.playVideo();
        } catch(e) {}
    }, 500);
}

function playNextYt() {
    if (!ytPlayerReady || !ytPlayer) return;
    
    const index = parseInt(playlistSelect.value);
    const item = playlists[index];
    
    if (item.type === 'playlist') {
        try {
            ytPlayer.nextVideo();
        } catch(e) {
            cyclePlaylistDropdown();
        }
    } else {
        cyclePlaylistDropdown();
    }
}

function playPrevYt() {
    if (!ytPlayerReady || !ytPlayer) return;
    
    const index = parseInt(playlistSelect.value);
    const item = playlists[index];
    
    if (item.type === 'playlist') {
        try {
            ytPlayer.previousVideo();
        } catch(e) {
            cyclePlaylistDropdown(true);
        }
    } else {
        cyclePlaylistDropdown(true);
    }
}

function cyclePlaylistDropdown(reverse = false) {
    const currentIndex = parseInt(playlistSelect.value);
    let newIndex = 0;
    
    if (reverse) {
        newIndex = (currentIndex - 1 + playlists.length) % playlists.length;
    } else {
        newIndex = (currentIndex + 1) % playlists.length;
    }
    
    playlistSelect.value = newIndex;
    loadSelectedPlaylist();
}

// --- LocalStorage Database & Chart Generator ---
async function logSession() {
    const durationMins = Math.round(totalDurationSeconds / 60);
    const newLog = {
        id: Date.now().toString(),
        subject: selectedSubject,
        duration: durationMins,
        mode: timerMode,
        timestamp: new Date().toISOString()
    };
    
    if (!backendOffline) {
        try {
            const response = await fetch(`${API_BASE_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
            if (!response.ok) throw new Error('API server failed to save session log');
            updateDashboard();
            return;
        } catch (error) {
            console.warn('API error when logging session. Using LocalStorage fallback.', error);
            backendOffline = true;
        }
    }
    
    // Local fallback
    const historyJson = localStorage.getItem('zentime_history') || '[]';
    const history = JSON.parse(historyJson);
    history.push(newLog);
    localStorage.setItem('zentime_history', JSON.stringify(history));
    updateDashboard();
}

async function updateDashboard() {
    let history = [];
    
    if (!backendOffline) {
        try {
            const response = await fetch(`${API_BASE_URL}/sessions`);
            if (!response.ok) throw new Error('API server response not OK');
            history = await response.json();
            
            // Keep LocalStorage updated with server logs for offline state
            localStorage.setItem('zentime_history', JSON.stringify(history));
        } catch (error) {
            console.warn('API error when getting dashboard logs. Using LocalStorage fallback.', error);
            backendOffline = true;
            
            const historyJson = localStorage.getItem('zentime_history') || '[]';
            history = JSON.parse(historyJson);
        }
    } else {
        const historyJson = localStorage.getItem('zentime_history') || '[]';
        history = JSON.parse(historyJson);
    }
    
    // Filter history for sessions completed "today" in local timezone
    const todayStr = new Date().toLocaleDateString();
    const todaySessions = history.filter(item => {
        const itemDateStr = new Date(item.timestamp).toLocaleDateString();
        return itemDateStr === todayStr;
    });
    
    // 1. Calculate general stats for today
    totalSessionsEl.textContent = todaySessions.length;
    
    const totalMinutes = todaySessions.reduce((sum, item) => sum + item.duration, 0);
    if (totalMinutes < 60) {
        totalTimeEl.textContent = `${totalMinutes} phút`;
    } else {
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        totalTimeEl.textContent = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    
    // 2. Render chart (distribution by subject)
    renderChart(todaySessions);
    
    // 3. Render recent 3 logs
    renderRecentLogs(history);
}

function renderChart(sessions) {
    subjectChartEl.innerHTML = '';
    
    if (sessions.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-chart-msg';
        emptyMsg.textContent = 'Chưa có dữ liệu học tập hôm nay.';
        subjectChartEl.appendChild(emptyMsg);
        return;
    }
    
    // Aggregate minutes by subject
    const subjectMap = {};
    sessions.forEach(session => {
        const subj = session.subject || 'Chưa chọn';
        subjectMap[subj] = (subjectMap[subj] || 0) + session.duration;
    });
    
    // Find max focus time to scale widths
    let maxTime = 0;
    Object.values(subjectMap).forEach(time => {
        if (time > maxTime) maxTime = time;
    });
    
    // Create bars HTML
    Object.entries(subjectMap).forEach(([subject, minutes]) => {
        const percent = maxTime > 0 ? (minutes / maxTime) * 100 : 0;
        
        const row = document.createElement('div');
        row.className = 'chart-row';
        
        const info = document.createElement('div');
        info.className = 'chart-row-info';
        
        const subjSpan = document.createElement('span');
        subjSpan.className = 'chart-row-subject';
        subjSpan.textContent = subject === 'IELTS' ? 'IELTS Speaking' : subject;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'chart-row-time';
        timeSpan.textContent = `${minutes}m`;
        
        info.appendChild(subjSpan);
        info.appendChild(timeSpan);
        
        const barContainer = document.createElement('div');
        barContainer.className = 'chart-bar-container';
        
        const barFill = document.createElement('div');
        barFill.className = 'chart-bar-fill';
        
        // Accent color customization based on subject or just neon cyan
        if (subject === 'IELTS') {
            barFill.style.background = 'linear-gradient(90deg, #00F2FE, #FF2E93)';
        }
        
        barContainer.appendChild(barFill);
        row.appendChild(info);
        row.appendChild(barContainer);
        
        subjectChartEl.appendChild(row);
        
        // Trigger CSS animation delay to load bars nicely
        setTimeout(() => {
            barFill.style.width = `${percent}%`;
        }, 100);
    });
}

function renderRecentLogs(history) {
    sessionLogsListEl.innerHTML = '';
    
    // Show only the last 3 logs
    const recentLogs = [...history].reverse().slice(0, 3);
    
    if (recentLogs.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.textAlign = 'center';
        emptyLi.style.color = 'var(--text-muted-dark)';
        emptyLi.style.fontSize = '0.8rem';
        emptyLi.style.padding = '8px 0';
        emptyLi.textContent = 'Chưa có hoạt động nào được ghi lại.';
        sessionLogsListEl.appendChild(emptyLi);
        return;
    }
    
    recentLogs.forEach(log => {
        const li = document.createElement('li');
        li.className = 'log-item';
        
        const leftDiv = document.createElement('div');
        leftDiv.style.display = 'flex';
        leftDiv.style.alignItems = 'center';
        leftDiv.style.gap = '8px';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'log-subject-badge';
        nameSpan.textContent = log.subject === 'IELTS' ? 'IELTS Speak' : log.subject;
        
        const modeSpan = document.createElement('span');
        modeSpan.className = `log-mode-badge ${log.mode === 'ielts' || log.mode === 'focus' ? 'log-mode-focus' : 'log-mode-break'}`;
        modeSpan.textContent = log.mode === 'ielts' ? 'IELTS' : (log.mode === 'focus' ? 'Tập trung' : 'Nghỉ ngơi');
        
        leftDiv.appendChild(nameSpan);
        leftDiv.appendChild(modeSpan);
        
        const rightDiv = document.createElement('div');
        rightDiv.className = 'log-time-details';
        
        // Format relative or standard time
        const logDate = new Date(log.timestamp);
        const timeStr = `${String(logDate.getHours()).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')}`;
        
        rightDiv.textContent = `${log.duration}m (${timeStr})`;
        
        li.appendChild(leftDiv);
        li.appendChild(rightDiv);
        
        sessionLogsListEl.appendChild(li);
    });
}

// ==========================================================================
// SPA Tab Switching Logic & Features (Documents & Courses)
// ==========================================================================

let documentsList = [];
let coursesList = [];
let currentViewingCourseId = null;

// --- Tab Initialization ---
function initTabs() {
    const navItems = document.querySelectorAll('.nav-tab-item');
    const tabWrappers = {
        'home': document.getElementById('tab-home'),
        'documents': document.getElementById('tab-documents'),
        'courses': document.getElementById('tab-courses')
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            
            // Set active class on nav buttons
            navItems.forEach(n => {
                n.classList.remove('active');
                n.removeAttribute('aria-current');
            });
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
            
            // Show corresponding tab content
            Object.keys(tabWrappers).forEach(key => {
                if (key === tabName) {
                    tabWrappers[key].classList.remove('hidden');
                } else {
                    tabWrappers[key].classList.add('hidden');
                }
            });
        });
    });
}

// --- Documents Feature ---
async function initDocuments() {
    const toggleAddFormBtn = document.getElementById('toggle-add-doc-btn');
    const cancelAddBtn = document.getElementById('cancel-add-doc-btn');
    const addFormCard = document.getElementById('add-doc-form-card');
    const addForm = document.getElementById('add-document-form');
    const searchInput = document.getElementById('doc-search-input');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Toggle add form
    if (toggleAddFormBtn) {
        toggleAddFormBtn.addEventListener('click', () => {
            addFormCard.classList.toggle('hidden');
            if (!addFormCard.classList.contains('hidden')) {
                document.getElementById('doc-title').focus();
            }
        });
    }

    if (cancelAddBtn) {
        cancelAddBtn.addEventListener('click', () => {
            addFormCard.classList.add('hidden');
            addForm.reset();
        });
    }

    // Submit new document
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('doc-title').value.trim();
            const url = document.getElementById('doc-url').value.trim();
            const category = document.getElementById('doc-category').value;

            if (!title || !url) return;

            const newDoc = { title, url, category };

            try {
                const res = await fetch(`${API_BASE_URL}/documents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newDoc)
                });
                if (!res.ok) throw new Error('API error');
                const savedDoc = await res.json();
                
                documentsList.push(savedDoc);
                localStorage.setItem('zentime_documents', JSON.stringify(documentsList));
            } catch (err) {
                console.warn('API connection failed. Saving document locally.', err);
                // Local fallback
                const offlineDoc = {
                    id: Date.now().toString(),
                    title,
                    url,
                    category,
                    timestamp: new Date().toISOString()
                };
                documentsList.push(offlineDoc);
                localStorage.setItem('zentime_documents', JSON.stringify(documentsList));
            }

            addForm.reset();
            addFormCard.classList.add('hidden');
            renderDocuments();
        });
    }

    // Real-time search
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderDocuments();
        });
    }

    // Category filter click
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDocuments();
        });
    });

    // Initial load
    await loadDocuments();
}

async function loadDocuments() {
    try {
        const res = await fetch(`${API_BASE_URL}/documents`);
        if (!res.ok) throw new Error('Server error');
        documentsList = await res.json();
        localStorage.setItem('zentime_documents', JSON.stringify(documentsList));
    } catch (err) {
        console.warn('Could not fetch documents from API. Falling back to local storage.', err);
        documentsList = JSON.parse(localStorage.getItem('zentime_documents') || '[]');
        if (documentsList.length === 0) {
            // Default sample documents if empty
            documentsList = [
                { id: '1', title: '1000 Từ Vựng IELTS Core thông dụng nhất', category: 'IELTS', url: 'https://drive.google.com', timestamp: new Date().toISOString() },
                { id: '2', title: 'Tổng Hợp Công Thức Giải Tích 12 Toán Học', category: 'Toán Học', url: 'https://drive.google.com', timestamp: new Date().toISOString() },
                { id: '3', title: 'Cẩm Nang Học Javascript Từ Cơ Bản Đến Nâng Cao', category: 'Lập Trình', url: 'https://github.com', timestamp: new Date().toISOString() }
            ];
            localStorage.setItem('zentime_documents', JSON.stringify(documentsList));
        }
    }
    renderDocuments();
}

function renderDocuments() {
    const grid = document.getElementById('documents-grid');
    if (!grid) return;
    
    const searchInput = document.getElementById('doc-search-input');
    const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const activeFilterBtn = document.querySelector('.filter-btn.active');
    const activeFilter = activeFilterBtn ? activeFilterBtn.getAttribute('data-category') : 'all';

    grid.innerHTML = '';

    const filtered = documentsList.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(searchVal);
        const matchesCategory = activeFilter === 'all' || doc.category === activeFilter;
        return matchesSearch && matchesCategory;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state">Không tìm thấy tài liệu phù hợp.</div>`;
        return;
    }

    filtered.forEach(doc => {
        const card = document.createElement('article');
        card.className = 'black-card document-card';

        // Emoji icons based on category
        let categoryEmoji = '📁';
        if (doc.category === 'IELTS') categoryEmoji = '🇬🇧';
        if (doc.category === 'Toán Học') categoryEmoji = '📐';
        if (doc.category === 'Lập Trình') categoryEmoji = '💻';

        card.innerHTML = `
            <div class="document-meta-top">
                <div class="document-icon">${categoryEmoji}</div>
                <span class="document-category-tag">${doc.category}</span>
            </div>
            <h3 class="document-title-text">${doc.title}</h3>
            <div class="document-footer">
                <span class="document-date">${new Date(doc.timestamp).toLocaleDateString('vi-VN')}</span>
                <a href="${doc.url}" target="_blank" class="btn-download-doc">
                    <span>Mở / Tải</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- Courses Feature ---
async function initCourses() {
    const toggleAddFormBtn = document.getElementById('toggle-add-course-btn');
    const cancelAddBtn = document.getElementById('cancel-add-course-btn');
    const addFormCard = document.getElementById('add-course-form-card');
    const addForm = document.getElementById('add-course-form');
    
    // Modal controls
    const modal = document.getElementById('video-player-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const btnPrevLesson = document.getElementById('btn-prev-lesson');
    const btnNextLesson = document.getElementById('btn-next-lesson');
    const btnCompleteLesson = document.getElementById('btn-complete-lesson');
    const overlay = modal ? modal.querySelector('.modal-overlay') : null;

    // Toggle add course form
    if (toggleAddFormBtn) {
        toggleAddFormBtn.addEventListener('click', () => {
            addFormCard.classList.toggle('hidden');
            if (!addFormCard.classList.contains('hidden')) {
                document.getElementById('course-title').focus();
            }
        });
    }

    if (cancelAddBtn) {
        cancelAddBtn.addEventListener('click', () => {
            addFormCard.classList.add('hidden');
            addForm.reset();
        });
    }

    // Helper to parse YouTube playlist ID from URL or input
    function parsePlaylistId(url) {
        if (!url) return '';
        if (url.includes('list=')) {
            const matches = url.match(/[&?]list=([^&]+)/);
            return matches ? matches[1] : url;
        }
        return url;
    }

    // Submit new course
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('course-title').value.trim();
            const teacher = document.getElementById('course-teacher').value.trim() || 'Tự học';
            const rawPlaylistId = document.getElementById('course-playlist-id').value.trim();
            const videoCount = parseInt(document.getElementById('course-video-count').value) || 10;

            const playlistId = parsePlaylistId(rawPlaylistId);
            if (!title) return;

            const newCourse = {
                title,
                teacher,
                playlistId,
                videoCount,
                completedVideos: [],
                currentVideoIndex: 0
            };

            try {
                const res = await fetch(`${API_BASE_URL}/courses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newCourse)
                });
                if (!res.ok) throw new Error('API error');
                const savedCourse = await res.json();
                coursesList.push(savedCourse);
                localStorage.setItem('zentime_courses', JSON.stringify(coursesList));
            } catch (err) {
                console.warn('API connection failed. Saving course locally.', err);
                // Local fallback
                const offlineCourse = {
                    ...newCourse,
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString()
                };
                coursesList.push(offlineCourse);
                localStorage.setItem('zentime_courses', JSON.stringify(coursesList));
            }

            addForm.reset();
            addFormCard.classList.add('hidden');
            renderCourses();
        });
    }

    // Close Modal actions
    const closeModal = () => {
        if (modal) modal.classList.add('hidden');
        // Clear iframe source to stop video playback
        const container = document.getElementById('modal-youtube-iframe-container');
        if (container) container.innerHTML = '';
        currentViewingCourseId = null;
    };

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', closeModal);

    // Modal Lesson Navigation & Completed status
    if (btnPrevLesson) {
        btnPrevLesson.addEventListener('click', () => {
            const course = coursesList.find(c => c.id === currentViewingCourseId);
            if (!course || course.currentVideoIndex <= 0) return;
            course.currentVideoIndex--;
            updateModalPlayer();
            saveCourseProgress(course);
        });
    }

    if (btnNextLesson) {
        btnNextLesson.addEventListener('click', () => {
            const course = coursesList.find(c => c.id === currentViewingCourseId);
            if (!course || course.currentVideoIndex >= course.videoCount - 1) return;
            course.currentVideoIndex++;
            updateModalPlayer();
            saveCourseProgress(course);
        });
    }

    if (btnCompleteLesson) {
        btnCompleteLesson.addEventListener('click', () => {
            const course = coursesList.find(c => c.id === currentViewingCourseId);
            if (!course) return;
            
            const currentIdx = course.currentVideoIndex;
            if (!course.completedVideos.includes(currentIdx)) {
                course.completedVideos.push(currentIdx);
            } else {
                // Toggle complete (uncheck)
                course.completedVideos = course.completedVideos.filter(idx => idx !== currentIdx);
            }

            updateModalPlayer();
            saveCourseProgress(course);
            renderCourses();
        });
    }

    // Load initial list
    await loadCourses();
}

async function loadCourses() {
    try {
        const res = await fetch(`${API_BASE_URL}/courses`);
        if (!res.ok) throw new Error('Server error');
        coursesList = await res.json();
        localStorage.setItem('zentime_courses', JSON.stringify(coursesList));
    } catch (err) {
        console.warn('Could not fetch courses from API. Falling back to local storage.', err);
        coursesList = JSON.parse(localStorage.getItem('zentime_courses') || '[]');
        if (coursesList.length === 0) {
            // Default sample courses
            coursesList = [
                { id: '1', title: 'Lập Trình Web Fullstack hiện đại (NodeJS / React)', teacher: 'F8 Fullstack', playlistId: 'PLw717l4Vd8p45-F7v8uY4f2N0M2jR8YfF', videoCount: 30, completedVideos: [0, 1, 2], currentVideoIndex: 3, timestamp: new Date().toISOString() },
                { id: '2', title: 'IELTS Speaking Band 7.5+ Masterclass', teacher: 'IELTS Simon', playlistId: '', videoCount: 15, completedVideos: [0], currentVideoIndex: 1, timestamp: new Date().toISOString() }
            ];
            localStorage.setItem('zentime_courses', JSON.stringify(coursesList));
        }
    }
    renderCourses();
}

function renderCourses() {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;
    
    grid.innerHTML = '';

    if (coursesList.length === 0) {
        grid.innerHTML = `<div class="empty-state">Chưa có khóa học nào được đăng ký.</div>`;
        return;
    }

    let totalAllVideos = 0;
    let totalAllCompleted = 0;

    coursesList.forEach((course, index) => {
        totalAllVideos += course.videoCount;
        totalAllCompleted += course.completedVideos.length;

        const card = document.createElement('div');
        card.className = 'black-card course-card';
        card.setAttribute('data-index', index % 3); // for colorful gradient thumbnails

        const progressPercent = Math.round((course.completedVideos.length / course.videoCount) * 100) || 0;

        card.innerHTML = `
            <div class="course-thumbnail"></div>
            <span class="course-teacher-label">Kênh: ${course.teacher}</span>
            <h3 class="course-title-text">${course.title}</h3>
            
            <div class="course-progress-section">
                <div class="course-progress-labels">
                    <span>Đã học: ${course.completedVideos.length}/${course.videoCount} bài</span>
                    <span>${progressPercent}%</span>
                </div>
                <div class="course-progress-bar-bg">
                    <div class="course-progress-bar-fill" style="width: ${progressPercent}%;"></div>
                </div>
            </div>
            
            <button type="button" class="btn-learn-course" onclick="openCoursePlayer('${course.id}')">Học tiếp</button>
        `;
        grid.appendChild(card);
    });

    // Update Overall Stats bar
    const overallPercent = Math.round((totalAllCompleted / totalAllVideos) * 100) || 0;
    const overallText = document.getElementById('overall-progress-text');
    const overallFill = document.getElementById('overall-progress-fill');
    if (overallText) overallText.textContent = `${overallPercent}%`;
    if (overallFill) overallFill.style.width = `${overallPercent}%`;
}

// Global functions for inline Event triggers
window.openCoursePlayer = function(courseId) {
    const course = coursesList.find(c => c.id === courseId);
    if (!course) return;

    currentViewingCourseId = courseId;
    
    const titleEl = document.getElementById('modal-course-title');
    if (titleEl) titleEl.textContent = course.title;
    
    // Show Modal
    const modal = document.getElementById('video-player-modal');
    if (modal) modal.classList.remove('hidden');
    
    updateModalPlayer();
};

function updateModalPlayer() {
    const course = coursesList.find(c => c.id === currentViewingCourseId);
    if (!course) return;

    const iframeContainer = document.getElementById('modal-youtube-iframe-container');
    const lessonNumEl = document.getElementById('current-lesson-num');
    const totalLessonsEl = document.getElementById('total-lessons-num');
    const completeBtn = document.getElementById('btn-complete-lesson');

    if (lessonNumEl) lessonNumEl.textContent = course.currentVideoIndex + 1;
    if (totalLessonsEl) totalLessonsEl.textContent = course.videoCount;

    // Toggle button completed text and style
    if (completeBtn) {
        const isCompleted = course.completedVideos.includes(course.currentVideoIndex);
        if (isCompleted) {
            completeBtn.textContent = '✓ Đã hoàn thành';
            completeBtn.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
            completeBtn.style.color = '#fff';
        } else {
            completeBtn.textContent = '✓ Hoàn thành bài này';
            completeBtn.style.background = '';
            completeBtn.style.color = '';
        }
    }

    // Load video player
    if (iframeContainer) {
        if (course.playlistId) {
            // Embed YouTube playlist with specific video index
            iframeContainer.innerHTML = `
                <iframe 
                    src="https://www.youtube.com/embed/videoseries?list=${course.playlistId}&index=${course.currentVideoIndex}&enablejsapi=1"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        } else {
            // Mock video player when no playlist id is configured
            iframeContainer.innerHTML = `
                <div class="video-placeholder">
                    <p>Khóa học này đang ở chế độ học ngoại tuyến/không có Playlist YouTube.</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">Bạn có thể mở khóa học và đánh dấu hoàn thành bài học để theo dõi tiến độ!</p>
                </div>
            `;
        }
    }
}

async function saveCourseProgress(course) {
    try {
        const res = await fetch(`${API_BASE_URL}/courses/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: course.id,
                completedVideos: course.completedVideos,
                currentVideoIndex: course.currentVideoIndex
            })
        });
        if (!res.ok) throw new Error('API error');
        const updated = await res.json();
        
        // Update local object
        const localIndex = coursesList.findIndex(c => c.id === course.id);
        if (localIndex !== -1) {
            coursesList[localIndex] = updated;
        }
        localStorage.setItem('zentime_courses', JSON.stringify(coursesList));
    } catch (err) {
        console.warn('API connection failed. Saving course progress locally.', err);
        localStorage.setItem('zentime_courses', JSON.stringify(coursesList));
    }
}
