import os
import json
import time
import boto3
from dotenv import load_dotenv
from process_video import process_video_pipeline
from logger import get_json_logger

logger = get_json_logger("sqs_consumer")

load_dotenv()

try:
    with open("../config.json", "r") as f:
        config = json.load(f)
except FileNotFoundError:
    logger.error("config.json not found, using defaults.")
    config = {}

AWS_REGION = config.get("AWS_REGION", os.getenv("AWS_REGION", "ap-south-1"))
QUEUE_URL = config.get("QUEUE_URL", os.getenv("QUEUE_URL"))

if not QUEUE_URL:
    logger.warning("QUEUE_URL not set in environment or config.")

sqs = boto3.client('sqs', region_name=AWS_REGION)
s3 = boto3.client('s3', region_name=AWS_REGION)

def process_message(msg):
    try:
        body = json.loads(msg["Body"])
        
        # Handle S3 Event Notification format
        if "Records" in body:
            record = body["Records"][0]
            bucket = record["s3"]["bucket"]["name"]
            key = record["s3"]["object"]["key"]
        else:
            # Handle custom format specified in prompt
            bucket = body.get("bucket")
            key = body.get("key")
            
        if not bucket or not key:
            logger.error("Invalid message format, skipping.")
            return False
            
        logger.info(f"Processing video from s3://{bucket}/{key}")
        
        video_id = key.split("/")[-1].split(".")[0]
        
        # Generate a short-lived presigned URL so process_video can download it
        # (Alternatively, we could download directly using boto3, but process_video already expects a URL)
        presigned_url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=3600
        )
        
        # Run the AI pipeline
        result = process_video_pipeline(presigned_url, video_id)
        
        if result:
            logger.info(f"Successfully processed {key}")
            # Optionally, save result to PostgreSQL here
            return True
        else:
            logger.error(f"Failed to process {key} with AI pipeline")
            return False
            
    except Exception as e:
        logger.error(f"Error processing message: {e}")
        return False

def start_polling():
    logger.info(f"Starting SQS consumer for queue: {QUEUE_URL}")
    while True:
        try:
            response = sqs.receive_message(
                QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=10 # Long polling
            )
            
            messages = response.get("Messages", [])
            
            for msg in messages:
                logger.info("Received message, starting processing...")
                success = process_message(msg)
                
                # If processed successfully or invalid format (don't retry), delete from queue
                if success:
                    sqs.delete_message(
                        QueueUrl=QUEUE_URL,
                        ReceiptHandle=msg["ReceiptHandle"]
                    )
                    logger.info("Message deleted from queue.")
                    
        except Exception as e:
            logger.error(f"Polling error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    if QUEUE_URL:
        start_polling()
    else:
        logger.error("Set QUEUE_URL to start polling.")
