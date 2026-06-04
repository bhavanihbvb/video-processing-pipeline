import os
import json
import time
from process_video import process_local_video, process_video_pipeline
from logger import get_json_logger

logger = get_json_logger("local_consumer")

try:
    with open("../config.json", "r") as f:
        config = json.load(f)
except FileNotFoundError:
    logger.error("config.json not found, using defaults.")
    config = {}

QUEUE_FILE = config.get("QUEUE_FILE", "../queue.json")

def get_next_message():
    if not os.path.exists(QUEUE_FILE):
        return None
        
    try:
        with open(QUEUE_FILE, "r+") as f:
            # Request an exclusive lock (not strictly required for local MVP if single process, but good practice)
            content = f.read()
            if not content.strip():
                return None
                
            queue = json.loads(content)
            if not queue:
                return None
                
            # Get the first message
            msg = queue.pop(0)
            
            # Rewrite queue
            f.seek(0)
            f.truncate()
            json.dump(queue, f, indent=2)
            
            return msg
    except Exception as e:
        logger.error(f"Error reading queue: {e}")
        return None

def start_polling():
    logger.info(f"Starting local consumer polling {QUEUE_FILE}...")
    while True:
        msg = get_next_message()
        if msg:
            logger.info(f"Received message: {msg}")
            video_id = msg.get("video_id")
            video_path = msg.get("video_path")
            video_url = msg.get("video_url")
            
            if video_id:
                try:
                    golden_video_url = msg.get("golden_video_url", "")
                    if video_url:
                        result = process_video_pipeline(video_url, video_id, golden_video_url)
                    elif video_path:
                        result = process_local_video(video_path, video_id, golden_video_url)
                    else:
                        result = None
                        
                    if result:
                        logger.info(f"Successfully processed video {video_id}")
                    else:
                        logger.error(f"Processing failed or returned None for {video_id}")
                        with open(f"result_{video_id}.json", "w") as f:
                            json.dump({"error": "Failed to analyze video"}, f)
                except Exception as e:
                    logger.error(f"Error processing video {video_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    with open(f"result_{video_id}.json", "w") as f:
                        json.dump({"error": str(e)}, f)
        else:
            time.sleep(3)

if __name__ == "__main__":
    start_polling()
