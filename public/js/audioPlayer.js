/**
 * Sticky Audio Player
 * Manages global audio playback across the site
 */

// Debug mode
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const log = isDev ? console.log.bind(console) : function() {};

class AudioPlayer {
  constructor() {
    this.audio = document.getElementById('audio');
    this.player = document.getElementById('audioPlayer');
    this.currentLecture = null;
    this.isPlaying = false;
    this.isDragging = false;
    this.isTouchDragging = false;

    this.initElements();
    this.loadPreferences();
    this.setupEventListeners();

    window.audioPlayer = this;
  }

  initElements() {
    // Info elements
    this.titleEl = document.getElementById('playerLectureTitle');
    this.sheikhEl = document.getElementById('playerSheikhName');

    // Playback controls
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.playIcon = document.getElementById('playIcon');
    this.skipBackwardBtn = document.getElementById('skipBackward');
    this.skipForwardBtn = document.getElementById('skipForward');
    this.closePlayerBtn = document.getElementById('closePlayerBtn');

    // Progress elements
    this.progressContainer = document.getElementById('progressContainer');
    this.progressBar = document.getElementById('progressBar');
    this.progressHandle = document.getElementById('progressHandle');
    this.currentTimeEl = document.getElementById('currentTime');
    this.durationEl = document.getElementById('duration');

    // Speed control
    this.speedBtn = document.getElementById('speedBtn');
    this.speedMenu = document.getElementById('speedMenu');
    this.speedLabel = document.getElementById('speedLabel');

    // Volume control
    this.volumeBtn = document.getElementById('volumeBtn');
    this.volumeIcon = document.getElementById('volumeIcon');
    this.volumePopup = document.getElementById('volumePopup');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.volumeValue = document.getElementById('volumeValue');

    // Share button
    this.shareBtn = document.getElementById('shareBtn');

    // Download button
    this.downloadBtn = document.getElementById('downloadBtn');

    // Mini player elements
    this.miniPlayer = document.getElementById('miniPlayer');
    this.miniPlayerTitle = document.getElementById('miniPlayerTitle');
    this.miniPlayPauseBtn = document.getElementById('miniPlayPauseBtn');
    this.miniPlayIcon = document.getElementById('miniPlayIcon');
    this.miniCurrentTime = document.getElementById('miniCurrentTime');
    this.miniDuration = document.getElementById('miniDuration');
    this.fullPlayer = document.getElementById('fullPlayer');

    // State
    this.isMinimized = false;
    this.isMobile = window.innerWidth <= 768;
    this.isMuted = false;
  }

  setupEventListeners() {
    // Audio events
    this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('play', () => this.onPlay());
    this.audio.addEventListener('pause', () => this.onPause());
    this.audio.addEventListener('error', (e) => this.onError(e));

    // Control buttons
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.skipBackwardBtn.addEventListener('click', () => this.skip(-15));
    this.skipForwardBtn.addEventListener('click', () => this.skip(15));
    this.closePlayerBtn.addEventListener('click', () => this.close());

    // Progress bar - mouse events
    this.progressContainer.addEventListener('mousedown', (e) => this.startDrag(e));

    // Progress bar - touch events
    this.progressContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.progressContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.progressContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    // Prevent background scroll when touching progress bar
    this.player.addEventListener('touchmove', (e) => {
      if (e.target.closest('.progress-container')) {
        e.preventDefault();
      }
    }, { passive: false });

    // Speed control
    this.speedBtn.addEventListener('click', () => this.toggleSpeedMenu());
    document.querySelectorAll('.speed-option').forEach(btn => {
      btn.addEventListener('click', (e) => this.setSpeed(parseFloat(e.target.dataset.speed)));
    });

    // Volume control
    if (this.volumeBtn) {
      this.volumeBtn.addEventListener('click', () => this.toggleVolumePopup());
    }

    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
    }

    // Close volume popup when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.volume-control') && this.volumePopup) {
        this.volumePopup.classList.add('hidden');
      }
    });

    // Share button
    if (this.shareBtn) {
      this.shareBtn.addEventListener('click', () => this.share());
    }

    // Close speed menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.speed-control')) {
        this.speedMenu.classList.add('hidden');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    // Auto-minimize on scroll (mobile)
    if (this.isMobile) {
      let lastScrollY = window.scrollY;
      window.addEventListener('scroll', () => {
        if (!this.player.classList.contains('hidden') && !this.isMinimized) {
          const currentScrollY = window.scrollY;
          if (currentScrollY > lastScrollY + 10) {
            this.minimize();
          }
          lastScrollY = currentScrollY;
        }
      }, { passive: true });
    }

    // Handle window resize
    window.addEventListener('resize', () => {
      this.isMobile = window.innerWidth <= 768;
      if (!this.isMobile && this.isMinimized) {
        this.expand();
      }
    });
  }

  /**
   * Play a lecture
   */
  play(lectureId, lectureData) {
    log('▶️ Playing lecture:', lectureId, lectureData);

    this.currentLecture = { id: lectureId, ...lectureData };

    // Update UI
    this.titleEl.textContent = lectureData.title || lectureData.titleArabic || 'Unknown';
    this.sheikhEl.textContent = lectureData.sheikh || '';

    // Update mini-player
    if (this.miniPlayerTitle) {
      this.miniPlayerTitle.textContent = lectureData.title || lectureData.titleArabic || '';
    }

    // Set audio source
    this.audio.src = `/stream/${lectureId}`;

    // Set download link
    this.downloadBtn.href = `/download/${lectureId}`;
    this.downloadBtn.style.display = 'flex';

    // Show player
    this.show();

    // Load saved position
    const savedPosition = this.getSavedPosition(lectureId);
    if (savedPosition > 0) {
      this.audio.currentTime = savedPosition;
    }

    // Play
    this.audio.play().catch(err => {
      console.error('❌ Playback error:', err);
      alert('Could not play audio. Please check if the file exists.');
    });
  }

  togglePlayPause() {
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  skip(seconds) {
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
  }

  seekToTime(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds)) {
      console.warn('Invalid seek time:', seconds);
      return;
    }

    if (!this.audio.duration || isNaN(this.audio.duration)) {
      this.audio.addEventListener('loadedmetadata', () => {
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
      }, { once: true });
      return;
    }

    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
  }

  seek(e) {
    if (!this.audio.duration || isNaN(this.audio.duration)) return;

    const rect = this.progressContainer.getBoundingClientRect();
    const isRTL = document.documentElement.dir === 'rtl';

    let percent;
    if (isRTL) {
      percent = Math.max(0, Math.min(1, (rect.right - e.clientX) / rect.width));
    } else {
      percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    }

    const newTime = percent * this.audio.duration;

    this.progressBar.style.width = `${percent * 100}%`;
    this.currentTimeEl.textContent = this.formatTime(newTime);

    this.audio.currentTime = newTime;
  }

  startDrag(e) {
    e.preventDefault();
    this.isDragging = true;
    this.progressContainer.classList.add('dragging');
    document.body.classList.add('audio-seeking');
    this.seek(e);

    const onMouseMove = (e) => {
      if (this.isDragging) this.seek(e);
    };

    const onMouseUp = () => {
      this.isDragging = false;
      this.progressContainer.classList.remove('dragging');
      document.body.classList.remove('audio-seeking');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  handleTouchStart(e) {
    e.preventDefault();
    this.isTouchDragging = true;
    this.progressContainer.classList.add('dragging');
    document.body.classList.add('audio-seeking');
    this.seekFromTouch(e);
  }

  handleTouchMove(e) {
    if (this.isTouchDragging) {
      e.preventDefault();
      this.seekFromTouch(e);
    }
  }

  handleTouchEnd(e) {
    this.isTouchDragging = false;
    this.progressContainer.classList.remove('dragging');
    document.body.classList.remove('audio-seeking');
  }

  seekFromTouch(e) {
    if (!this.audio.duration || isNaN(this.audio.duration)) return;

    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;

    const rect = this.progressContainer.getBoundingClientRect();
    const isRTL = document.documentElement.dir === 'rtl';

    let percent;
    if (isRTL) {
      percent = Math.max(0, Math.min(1, (rect.right - touch.clientX) / rect.width));
    } else {
      percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    }

    const newTime = percent * this.audio.duration;

    this.progressBar.style.width = `${percent * 100}%`;
    this.currentTimeEl.textContent = this.formatTime(newTime);

    this.audio.currentTime = newTime;
  }

  toggleSpeedMenu() {
    this.speedMenu.classList.toggle('hidden');
  }

  setSpeed(speed) {
    this.audio.playbackRate = speed;
    this.speedLabel.textContent = `${speed}x`;

    document.querySelectorAll('.speed-option').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });

    localStorage.setItem('audioPlayerSpeed', speed);
    this.speedMenu.classList.add('hidden');
  }

  toggleVolumePopup() {
    if (!this.volumePopup) return;
    this.volumePopup.classList.toggle('hidden');
    // Close speed menu if open
    this.speedMenu.classList.add('hidden');
  }

  setVolume(value) {
    const volume = parseInt(value, 10);
    this.audio.volume = volume / 100;
    this.audio.muted = volume === 0;
    this.isMuted = volume === 0;

    // Update slider value display
    if (this.volumeValue) {
      this.volumeValue.textContent = `${volume}%`;
    }

    // Update slider position
    if (this.volumeSlider) {
      this.volumeSlider.value = volume;
    }

    this.updateVolumeIcon();

    // Save preference
    localStorage.setItem('audioPlayerVolume', volume);
  }

  toggleMute() {
    if (this.isMuted) {
      // Unmute - restore previous volume or default to 100
      const savedVolume = localStorage.getItem('audioPlayerVolume') || 100;
      this.setVolume(savedVolume);
    } else {
      // Mute
      this.setVolume(0);
    }
  }

  updateVolumeIcon() {
    if (!this.volumeIcon) return;

    let iconName;
    const volume = this.audio.volume * 100;

    if (this.audio.muted || volume === 0) {
      iconName = 'volume-x';
    } else if (volume < 50) {
      iconName = 'volume-1';
    } else {
      iconName = 'volume-2';
    }

    this.volumeIcon.setAttribute('data-lucide', iconName);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  share() {
    if (!this.currentLecture) return;

    const url = `${window.location.origin}/lectures/${this.currentLecture.id}`;
    const title = this.currentLecture.title || this.currentLecture.titleArabic || '';

    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!');
      }).catch(() => {
        prompt('Copy this link:', url);
      });
    }
  }

  show() {
    this.isMobile = window.innerWidth <= 768;
    log('📱 show() - isMobile:', this.isMobile);

    if (this.isMobile) {
      this.player.classList.add('minimized');
      this.isMinimized = true;
      if (this.miniPlayerTitle && this.currentLecture) {
        this.miniPlayerTitle.textContent = this.currentLecture.title || this.currentLecture.titleArabic || '';
      }
      document.body.style.paddingBottom = '120px';
    } else {
      this.player.classList.remove('minimized');
      this.isMinimized = false;
      document.body.style.paddingBottom = '100px';
    }

    this.player.classList.remove('hidden');

    // Refresh Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  minimize() {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) return;

    this.player.classList.add('minimized');
    this.isMinimized = true;

    if (this.miniPlayerTitle && this.currentLecture) {
      this.miniPlayerTitle.textContent = this.currentLecture.title || this.currentLecture.titleArabic || '';
    }

    this.updateMiniPlayerIcon();
    document.body.style.paddingBottom = '120px';
  }

  expand() {
    this.player.classList.remove('minimized');
    this.isMinimized = false;
    this.isMobile = window.innerWidth <= 768;

    if (this.isMobile) {
      document.body.style.paddingBottom = '260px';
    } else {
      document.body.style.paddingBottom = '100px';
    }

    // Refresh icons after expand
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  close() {
    this.audio.pause();
    this.player.classList.add('hidden');
    document.body.style.paddingBottom = '0';

    if (this.currentLecture) {
      this.savePosition(this.currentLecture.id, this.audio.currentTime);
    }
  }

  // Update play/pause icons
  updatePlayIcon(isPlaying) {
    const iconName = isPlaying ? 'pause' : 'play';

    if (this.playIcon) {
      this.playIcon.setAttribute('data-lucide', iconName);
    }

    if (this.miniPlayIcon) {
      this.miniPlayIcon.setAttribute('data-lucide', iconName);
    }

    // Refresh Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  updateMiniPlayerIcon() {
    if (this.miniPlayIcon) {
      this.miniPlayIcon.setAttribute('data-lucide', this.isPlaying ? 'pause' : 'play');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }

  // Event handlers
  onLoadedMetadata() {
    const duration = this.formatTime(this.audio.duration);
    this.durationEl.textContent = duration;

    // Update mini player duration
    if (this.miniDuration) {
      this.miniDuration.textContent = duration;
    }

    if (this.currentLecture && this.audio.duration > 0) {
      this.verifyDuration(this.currentLecture.id, this.audio.duration);
    }
  }

  async verifyDuration(lectureId, actualDuration) {
    const verifiedKey = `duration_verified_${lectureId}`;
    if (localStorage.getItem(verifiedKey)) return;

    try {
      const response = await fetch(`/api/lectures/${lectureId}/verify-duration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: actualDuration })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem(verifiedKey, 'true');
        if (data.updated) {
          log(`✅ Duration corrected: ${data.oldDuration}s → ${data.newDuration}s`);
        }
      }
    } catch (error) {
      console.warn('Duration verification failed:', error.message);
    }
  }

  onTimeUpdate() {
    if (this.isDragging || this.isTouchDragging) return;

    const percent = (this.audio.currentTime / this.audio.duration) * 100;
    this.progressBar.style.width = `${percent}%`;

    const currentTime = this.formatTime(this.audio.currentTime);
    this.currentTimeEl.textContent = currentTime;

    // Update mini player time
    if (this.miniCurrentTime) {
      this.miniCurrentTime.textContent = currentTime;
    }

    // Auto-save position every 5 seconds
    if (this.currentLecture && this.audio.currentTime % 5 < 0.5) {
      this.savePosition(this.currentLecture.id, this.audio.currentTime);
    }
  }

  onEnded() {
    this.isPlaying = false;
    this.updatePlayIcon(false);

    if (this.currentLecture) {
      this.savePosition(this.currentLecture.id, 0);
    }
  }

  onPlay() {
    this.isPlaying = true;
    this.updatePlayIcon(true);
  }

  onPause() {
    this.isPlaying = false;
    this.updatePlayIcon(false);
  }

  onError(e) {
    console.error('❌ Audio error:', e);
    alert('Error playing audio. The file may not exist or is not accessible.');
  }

  handleKeyboard(e) {
    if (this.player.classList.contains('hidden') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch(e.key) {
      case ' ':
        e.preventDefault();
        this.togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.skip(-15);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.skip(15);
        break;
      case 'm':
      case 'M':
        this.toggleMute();
        break;
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  savePosition(lectureId, position) {
    try {
      localStorage.setItem(`audioPlayer_pos_${lectureId}`, position);
    } catch (e) {
      console.warn('Could not save position:', e);
    }
  }

  getSavedPosition(lectureId) {
    try {
      return parseFloat(localStorage.getItem(`audioPlayer_pos_${lectureId}`)) || 0;
    } catch (e) {
      return 0;
    }
  }

  loadPreferences() {
    // Load playback speed
    const savedSpeed = localStorage.getItem('audioPlayerSpeed');
    if (savedSpeed !== null) {
      this.setSpeed(parseFloat(savedSpeed));
    }

    // Load volume
    const savedVolume = localStorage.getItem('audioPlayerVolume');
    if (savedVolume !== null) {
      this.setVolume(parseInt(savedVolume, 10));
    }
  }
}

// Initialize when DOM is ready
log('🎵 Audio Player script loaded');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    log('🎵 Initializing Audio Player...');
    window.audioPlayer = new AudioPlayer();
    log('✅ Audio Player initialized');
  });
} else {
  log('🎵 Initializing Audio Player (already loaded)...');
  window.audioPlayer = new AudioPlayer();
  log('✅ Audio Player initialized');
}

// Global helpers for HTML onclick handlers
function expandPlayer() {
  if (window.audioPlayer) {
    window.audioPlayer.expand();
  }
}

function togglePlayPause() {
  if (window.audioPlayer) {
    window.audioPlayer.togglePlayPause();
  }
}
