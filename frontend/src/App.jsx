import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { Upload, FileVideo, CheckCircle, AlertCircle, Loader2, PlaySquare, ShieldAlert, BookOpen, GraduationCap } from 'lucide-react'
import './App.css'
import config from './config.json'

function App() {
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isUploading, setIsUploading] = useState(false)
  const [videoId, setVideoId] = useState(null)
  const [resultData, setResultData] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef(null)

  const [videoUrl, setVideoUrl] = useState('')
  const [goldenUrl, setGoldenUrl] = useState('')

  const goldenOptions = [
    { 
      label: "Plumbing Golden Standard (All 5 videos)", 
      value: `${config.STATIC_BASE_URL}/plumbing_01.mp4,${config.STATIC_BASE_URL}/plumbing_02.mp4,${config.STATIC_BASE_URL}/plumbing_03.mp4,${config.STATIC_BASE_URL}/plumbing_04.mp4,${config.STATIC_BASE_URL}/plumbing_05.mp4` 
    },
    { 
      label: "Electrical Golden Standard (All 5 videos)", 
      value: `${config.STATIC_BASE_URL}/electrical_01.mp4,${config.STATIC_BASE_URL}/electrical_02.mp4,${config.STATIC_BASE_URL}/electrical_03.mp4,${config.STATIC_BASE_URL}/electrical_04.mp4,${config.STATIC_BASE_URL}/electrical_05.mp4` 
    }
  ]

  const handleUrlSubmit = async () => {
    if (!videoUrl) return

    setIsUploading(true)
    setStatus({ type: '', message: '' })
    setResultData(null)

    try {
      const { data } = await axios.post(`${config.API_BASE_URL}/process-url`, {
        video_url: videoUrl,
        golden_video_url: goldenUrl,
        user_id: 'user_demo'
      })

      if (data.status === 'success') {
        setVideoId(data.video_id)
        setIsProcessing(true)
        setStatus({ 
          type: 'success', 
          message: 'URL queued successfully! The AI is now analyzing it...' 
        })
      }
    } catch (error) {
      console.error('Submit error:', error)
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.detail || 'An error occurred submitting the URL.' 
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Polling logic for video processing result
  useEffect(() => {
    let interval;
    if (videoId && isProcessing) {
      interval = setInterval(async () => {
        try {
          const { data } = await axios.get(`${config.API_BASE_URL}/result/${videoId}`)
          if (data.status === 'complete') {
            if (data.data && data.data.error) {
              setIsProcessing(false)
              let errorMsg = data.data.error;
              if (errorMsg.includes('429') || errorMsg.includes('Quota exceeded')) {
                errorMsg = "AI Analysis Failed: The Gemini API Free Tier rate limit has been exceeded. Please wait a minute and try again.";
              }
              setStatus({ type: 'error', message: errorMsg })
            } else {
              setResultData(data.data)
              setIsProcessing(false)
              setStatus({ type: 'success', message: 'Analysis complete!' })
            }
          } else if (data.status === 'error') {
            setIsProcessing(false)
            setStatus({ type: 'error', message: data.message || 'Error processing video.' })
          }
        } catch (error) {
          console.error("Polling error:", error)
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [videoId, isProcessing]);

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.type.startsWith('video/')) {
        setFile(droppedFile)
        setStatus({ type: '', message: '' })
      } else {
        setStatus({ type: 'error', message: 'Please upload a video file.' })
      }
    }
  }

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0])
      setStatus({ type: '', message: '' })
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)
    setStatus({ type: '', message: '' })
    setResultData(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('user_id', 'user_demo')
      if (goldenUrl) {
        formData.append('golden_video_url', goldenUrl)
      }

      const { data } = await axios.post(`${config.API_BASE_URL}/upload`, formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(percentCompleted)
        }
      })

      if (data.status === 'success') {
        setVideoId(data.video_id)
        setIsProcessing(true)
        setStatus({ 
          type: 'success', 
          message: 'Video uploaded successfully! The AI is now analyzing it...' 
        })
      }
      
    } catch (error) {
      console.error('Upload error:', error)
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.detail || 'An error occurred during upload.' 
      })
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const resetUpload = () => {
    setFile(null)
    setVideoUrl('')
    setGoldenUrl('')
    setVideoId(null)
    setResultData(null)
    setStatus({ type: '', message: '' })
  }

  return (
    <div className="app-container">
      <header className="header animate-fade-in">
        <h1>Kovon AI</h1>
        <p>Upload training videos for automated safety and skill analysis</p>
      </header>

      {!resultData ? (
        <div className="glass upload-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {!file && !videoUrl ? (
            <>
              <div 
                className={`upload-area ${isDragging ? 'active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="upload-icon" size={48} />
                <div className="upload-text">
                  <h3>Drag & Drop your video here</h3>
                  <p>or click to browse from your computer</p>
                </div>
                <input 
                  type="file" 
                  className="file-input" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="video/*"
                />
              </div>
              
              <div style={{ marginTop: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <select 
                  value={goldenUrl}
                  onChange={(e) => setGoldenUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.4)',
                    color: 'white',
                    fontSize: '1rem',
                    marginBottom: '15px'
                  }}
                >
                  <option value="">Select a Golden Reference Standard (Optional)</option>
                  {goldenOptions.map((opt, i) => (
                    <option key={i} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                <p>— OR —</p>
                <input 
                  type="text" 
                  placeholder="Paste S3 Video URL here..." 
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '12px 16px', 
                    borderRadius: '8px', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    background: 'rgba(0,0,0,0.2)', 
                    color: 'white',
                    fontSize: '1rem'
                  }}
                />
                <button 
                  className="btn-primary" 
                  onClick={handleUrlSubmit}
                  disabled={!videoUrl || isUploading || isProcessing}
                  style={{ marginTop: '15px', width: '100%' }}
                >
                  {isUploading ? (
                    <><Loader2 className="animate-spin" size={20} /> Queuing...</>
                  ) : (
                    <><PlaySquare size={20} /> Analyze URL</>
                  )}
                </button>
              </div>
            </>
          ) : file ? (
            <div className="selected-file">
              <FileVideo size={40} color="var(--accent)" />
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatFileSize(file.size)}</span>
              </div>
              {!isUploading && !isProcessing && (
                <button 
                  onClick={() => setFile(null)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="selected-file">
                <PlaySquare size={40} color="var(--accent)" />
                <div className="file-info">
                  <span className="file-name" style={{ wordBreak: 'break-all' }}>{videoUrl}</span>
                  <span className="file-size">Remote S3 URL</span>
                </div>
                {!isUploading && !isProcessing && (
                  <button 
                    onClick={() => setVideoUrl('')} 
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>
              
              {!isProcessing && (
                <button 
                  className="btn-primary" 
                  onClick={handleUrlSubmit}
                  disabled={!videoUrl || isUploading}
                  style={{ marginTop: '20px' }}
                >
                  {isUploading ? (
                    <><Loader2 className="animate-spin" size={20} /> Queuing...</>
                  ) : (
                    <><PlaySquare size={20} /> Analyze URL</>
                  )}
                </button>
              )}
            </>
          )}

          {isUploading && file && (
            <div className="progress-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          )}

          {!isProcessing && file && (
            <button 
              className="btn-primary" 
              onClick={handleUpload}
              disabled={!file || isUploading}
              style={{ marginTop: '20px' }}
            >
              {isUploading ? (
                <><Loader2 className="animate-spin" size={20} /> Uploading...</>
              ) : (
                <><PlaySquare size={20} /> Analyze Video</>
              )}
            </button>
          )}

          {isProcessing && (
            <div className="processing-status">
               <Loader2 className="animate-spin icon-large" size={32} color="var(--accent)" />
               <p>AI is currently processing your video...</p>
               <small>This may take up to a minute</small>
            </div>
          )}

          {status.message && (
            <div className={`status-message status-${status.type} animate-fade-in`}>
              {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              {status.message}
            </div>
          )}
        </div>
      ) : (
        <div className="dashboard-container animate-fade-in">
          <div className="dashboard-header">
            <h2>Analysis Results</h2>
            <button className="btn-secondary" onClick={resetUpload}>Analyze Another Video</button>
          </div>

          <div className="dashboard-layout" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            
            {/* Left Side: Recommendations Bot */}
            <div className="glass card recommendations-bot" style={{ flex: '1 1 300px', maxWidth: '400px', position: 'sticky', top: '20px' }}>
              <div className="card-header">
                <PlaySquare size={24} color="#ff0000" />
                <h3>Learning Recommendations</h3>
              </div>
              
              {resultData.topic && (
                <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Identified Topic:</span>
                  <div style={{ fontWeight: 'bold', textTransform: 'capitalize', marginTop: '4px', fontSize: '1.1rem' }}>{resultData.topic}</div>
                </div>
              )}
              
              <div className="recommendations-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Kovon AI Coach says:</p>
                
                {resultData.youtube_search_queries && resultData.youtube_search_queries.length > 0 ? (
                  <div className="bot-message" style={{ 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    borderLeft: '4px solid #3b82f6', 
                    padding: '15px', 
                    borderRadius: '0 8px 8px 0',
                    fontSize: '0.95rem',
                    lineHeight: '1.5'
                  }}>
                    <p style={{ marginBottom: '15px' }}>
                      Based on my analysis, I noticed some areas for improvement. I highly recommend watching tutorials on these topics to strengthen your skills:
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {resultData.youtube_search_queries.map((query, idx) => (
                        <a 
                          key={idx} 
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ 
                            textAlign: 'left', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '12px', 
                            textDecoration: 'none', 
                            fontSize: '0.95rem',
                            background: 'var(--surface-color)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ background: '#ff0000', borderRadius: '50%', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PlaySquare size={14} color="white" />
                          </div>
                          <span>Watch <strong>{query}</strong></span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No recommendations generated for this video yet.</p>
                )}
              </div>
            </div>

            {/* Right Side: Analysis Grid */}
            <div className="dashboard-grid" style={{ flex: '2 1 600px' }}>
              <div className="glass card score-card">
                <div className="card-header">
                  <GraduationCap size={24} color="var(--accent)" />
                  <h3>Skill Score</h3>
                </div>
                <div className="score-value">{resultData.skill_score || resultData.skill_gap_analysis?.overall_score || 0}/100</div>
              </div>

              <div className="glass card">
                <div className="card-header">
                  <ShieldAlert size={24} color="var(--error)" />
                  <h3>Safety Violations</h3>
                </div>
                <ul className="violation-list">
                  {(resultData.safety_violations || resultData.safety_analysis?.violations_detected || []).map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </div>

              <div className="glass card full-width">
                <div className="card-header">
                  <AlertCircle size={24} color="var(--warning, #f59e0b)" />
                  <h3>Missing Steps / Feedback</h3>
                </div>
                <ul className="feedback-list">
                  {(resultData.missing_steps || resultData.skill_gap_analysis?.feedback || []).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              <div className="glass card full-width">
                <div className="card-header">
                  <BookOpen size={24} color="var(--success)" />
                  <h3>Generated MCQs</h3>
                </div>
                <div className="mcq-list">
                  {(resultData.mcqs || resultData.mcq_questions || []).map((mcq, idx) => (
                    <div key={idx} className="mcq-item">
                      <h4>Q{idx + 1}: {mcq.question}</h4>
                      <ul>
                        {mcq.options.map((opt, oIdx) => (
                          <li key={oIdx} className={opt === mcq.answer ? 'correct-answer' : ''}>
                            {opt} {opt === mcq.answer && '✓'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {(resultData.transcript_english || resultData.transcript_hindi || resultData.transcript) && (
                <div className="glass card full-width">
                  <div className="card-header">
                    <FileVideo size={24} color="var(--accent)" />
                    <h3>Video Transcripts</h3>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    
                    {/* English Transcript */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <h4 style={{ marginBottom: '12px', color: '#60a5fa', fontSize: '1.05rem' }}>English</h4>
                      <div className="transcript-box" style={{ 
                        flex: '1',
                        maxHeight: '350px', 
                        overflowY: 'auto', 
                        padding: '20px', 
                        background: 'rgba(0,0,0,0.25)', 
                        borderRadius: '12px', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: '0.95rem',
                        lineHeight: '1.7',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-color)',
                        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.1)'
                      }}>
                        {resultData.transcript_english || resultData.transcript || "English transcript not available."}
                      </div>
                    </div>

                    {/* Hindi Transcript */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <h4 style={{ marginBottom: '12px', color: '#34d399', fontSize: '1.05rem' }}>Hindi (हिंदी)</h4>
                      <div className="transcript-box" style={{ 
                        flex: '1',
                        maxHeight: '350px', 
                        overflowY: 'auto', 
                        padding: '20px', 
                        background: 'rgba(0,0,0,0.25)', 
                        borderRadius: '12px', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: '0.95rem',
                        lineHeight: '1.7',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-color)',
                        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.1)'
                      }}>
                        {resultData.transcript_hindi || "Hindi transcript not available for this video."}
                      </div>
                    </div>
                    
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
