import os
import json
import time
import requests
from dotenv import load_dotenv
import google.generativeai as genai
from logger import get_json_logger

logger = get_json_logger("process_video")

# Load environment variables
load_dotenv()

try:
    with open("../config.json", "r") as f:
        config = json.load(f)
except FileNotFoundError:
    logger.error("config.json not found, using defaults.")
    config = {}

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    logger.error("No Gemini API key found in environment variables!")
genai.configure(api_key=api_key)

# Create necessary directories
DOWNLOADS_DIR = config.get("UPLOAD_DIR", "../downloads")
# Remove leading ../ if running inside worker
if DOWNLOADS_DIR.startswith("../"):
    DOWNLOADS_DIR = DOWNLOADS_DIR[3:]
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def download_video(url: str, output_path: str):
    logger.info(f"Downloading video from {url}...")
    response = requests.get(url, stream=True)
    response.raise_for_status()
    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    logger.info("Download complete.")

def upload_to_gemini(path: str, mime_type: str=None):
    logger.info(f"Uploading {path} to Gemini...")
    file = genai.upload_file(path, mime_type=mime_type)
    return file

def build_prompt(golden_video_files):
    analysis_config = config.get("analysis", {})
    
    # Flags with default True
    gen_mcqs = analysis_config.get("generate_mcqs", True)
    gen_transcripts = analysis_config.get("generate_transcripts", True)
    gen_scene = analysis_config.get("generate_scene_summary", True)
    gen_motion = analysis_config.get("generate_motion_analysis", True)
    gen_safety = analysis_config.get("generate_safety_analysis", True)
    gen_missing = analysis_config.get("generate_missing_steps", True)

    prompt = []
    if golden_video_files:
        prompt.append("You are an expert trainer analyzing a worker's practice training session by comparing it against a 'Golden Standard' reference video.")
        prompt.append("I have provided two sets of media:\n1. [GOLDEN STANDARD REFERENCE VIDEO] - The perfect execution.\n2. [USER PRACTICE ATTEMPT VIDEO] - The user's attempt.")
        prompt.append("Compare the Practice Attempt against the Golden Standard. Identify the exact skill gaps and procedural deviations where the user failed to follow the Golden Standard.")
    else:
        prompt.append("Analyze this worker training session using the provided audio and frames.")
        prompt.append("Based on the visual evidence in the video and the spoken instructions/context in the audio, please find:")

    reqs = []
    if golden_video_files:
        reqs.append("Skill gaps or mistakes made in the practice attempt compared to the golden standard")
    else:
        reqs.append("Skill gaps or mistakes made")
        
    if gen_safety:
        reqs.append("Safety violations (e.g. missing gloves, improper tools)")
    if gen_missing:
        reqs.append("Missing steps in the procedure")
    if gen_mcqs:
        reqs.append("Generate 2 Multiple Choice Questions (MCQs) to test the viewer's understanding.")
    if gen_scene:
        reqs.append("Scene summaries (break the video down into chronological scenes with short descriptions).")
    if gen_motion:
        reqs.append("Motion analysis (detect specific movements and infer skill levels or anomalies).")
    
    reqs.append("Topic & Recommendations: Identify the primary topic (e.g., \"plumbing\", \"electrical\") and generate 3 recommended YouTube search queries for tutorials that address the detected skill gaps.")
    
    if gen_transcripts:
        reqs.append("Transcripts: Provide a full verbatim transcript of the spoken audio translated into English, and a second transcript translated into Hindi (\u0939\u093f\u0902\u0926\u0940).")

    for i, req in enumerate(reqs, 1):
        prompt.append(f"{i}. {req}")

    prompt.append("\nOutput the result as a strict JSON object with this exact structure:")
    
    schema = {
        "topic": "plumbing",
        "youtube_search_queries": ["plumbing basics", "how to fix a pipe", "plumbing safety rules"],
        "skill_score": 85
    }
    if gen_transcripts:
        schema["transcript_english"] = "Full text of what was spoken in the video translated to English."
        schema["transcript_hindi"] = "Full text of what was spoken in the video translated to Hindi."
    if gen_missing:
        schema["missing_steps"] = ["list of missing steps"]
    if gen_safety:
        schema["safety_violations"] = ["list of safety violations"]
    if gen_scene:
        schema["scene_summaries"] = [{"timestamp": "0:00-1:00", "description": "Scene description"}]
    if gen_motion:
        schema["motions_detected"] = ["list of key motions or physical skills observed"]
    if gen_mcqs:
        schema["mcqs"] = [{"question": "Question text?", "options": ["A", "B", "C", "D"], "answer": "Correct option"}]
        
    prompt.append(json.dumps(schema, indent=2))
    prompt.append("Ensure the response contains ONLY the valid JSON block without markdown formatting or extra text.")
    
    return "\n".join(prompt)

def analyze_with_ai(video_file, golden_video_files, result_path="result.json"):
    pipeline_config = config.get("pipeline", {})
    if not pipeline_config.get("analyze_video", True):
        logger.info("analyze_video is disabled in config. Skipping AI analysis.")
        return None
        
    logger.info("Waiting for practice video file processing...")
    while True:
        f = genai.get_file(video_file.name)
        if f.state.name != 'PROCESSING': break
        time.sleep(2)
    logger.info("Practice video processing complete.")
    
    for gvf in golden_video_files:
        logger.info(f"Waiting for golden video file {gvf.name} processing...")
        while True:
            f = genai.get_file(gvf.name)
            if f.state.name != 'PROCESSING': break
            time.sleep(2)
        logger.info(f"Golden video {gvf.name} processing complete.")

    model_name = config.get("model", "gemini-flash-latest")
    logger.info(f"Analyzing with {model_name}...")
    model = genai.GenerativeModel(model_name)
    
    prompt = build_prompt(golden_video_files)
    
    contents = []
    if golden_video_files:
        contents.append("[GOLDEN STANDARD REFERENCE VIDEO START]")
        contents.extend(golden_video_files)
        contents.append("[GOLDEN STANDARD REFERENCE VIDEO END]\n\n[USER PRACTICE ATTEMPT VIDEO START]")
    
    contents.append(prompt)
    contents.append(video_file)
    
    if golden_video_files:
        contents.append("[USER PRACTICE ATTEMPT VIDEO END]")
    
    response = model.generate_content(contents, generation_config={"response_mime_type": "application/json"})
    
    result_text = response.text.strip()
    # Strip markdown if present
    if result_text.startswith("```json"):
        result_text = result_text[7:-3]
    elif result_text.startswith("```"):
        result_text = result_text[3:-3]
        
    result_text = result_text.strip()
    
    try:
        data = json.loads(result_text)
        with open(result_path, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(f"Analysis complete. Results saved to {result_path}.")
        return data
    except json.JSONDecodeError:
        logger.error(f"Failed to parse JSON. Raw output: {result_text}")
        with open("result_raw.txt", "w") as f:
            f.write(result_text)
        return None

def process_video_pipeline(video_url: str, video_id: str, golden_video_url: str = ""):
    pipeline_config = config.get("pipeline", {})
    result_path = f"result_{video_id}.json"
    golden_video_files = []
    
    analysis_config = config.get("analysis", {})
    should_compare = analysis_config.get("compare_with_golden", True)
    
    if should_compare and golden_video_url:
        golden_urls = [u.strip() for u in golden_video_url.split(',')]
        for idx, g_url in enumerate(golden_urls):
            golden_path = f"{DOWNLOADS_DIR}/golden_{idx}_{video_id}.mp4"
            if pipeline_config.get("download_video", True):
                download_video(g_url, golden_path)
            if pipeline_config.get("upload_to_gemini", True):
                golden_video_files.append(upload_to_gemini(golden_path, mime_type="video/mp4"))
            
    video_path = f"{DOWNLOADS_DIR}/video_{video_id}.mp4"
    if pipeline_config.get("download_video", True):
        download_video(video_url, video_path)
        
    video_file = None
    if pipeline_config.get("upload_to_gemini", True):
        video_file = upload_to_gemini(video_path, mime_type="video/mp4")
    
    if video_file:
        return analyze_with_ai(video_file, golden_video_files, result_path)
    return None

def process_local_video(video_path: str, video_id: str, golden_video_url: str = ""):
    pipeline_config = config.get("pipeline", {})
    result_path = f"result_{video_id}.json"
    
    golden_video_files = []
    analysis_config = config.get("analysis", {})
    should_compare = analysis_config.get("compare_with_golden", True)
    
    if should_compare and golden_video_url:
        golden_urls = [u.strip() for u in golden_video_url.split(',')]
        for idx, g_url in enumerate(golden_urls):
            golden_path = f"{DOWNLOADS_DIR}/golden_{idx}_{video_id}.mp4"
            if pipeline_config.get("download_video", True):
                download_video(g_url, golden_path)
            if pipeline_config.get("upload_to_gemini", True):
                golden_video_files.append(upload_to_gemini(golden_path, mime_type="video/mp4"))
            
    video_file = None
    if pipeline_config.get("upload_to_gemini", True):
        video_file = upload_to_gemini(video_path, mime_type="video/mp4")
    
    if video_file:
        return analyze_with_ai(video_file, golden_video_files, result_path)
    return None
