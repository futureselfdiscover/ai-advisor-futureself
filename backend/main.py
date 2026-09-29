import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

sys.path.append(str(Path(__file__).resolve().parent / "advisor"))
from router import route

app = FastAPI()

# Comma separated list. Add the Vercel URL here once the frontend is deployed.
origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    user_hash: Optional[str] = None


@app.get("/")
def root():
    return {"message": "AI Advisor API is running"}


@app.post("/chat")
def chat(req: ChatRequest):
    message = req.message.strip()

    if not message:
        return {
            "answer": "Ask me anything about courses, clubs, or careers.",
            "feature": "empty",
            "category": "none",
        }

    if len(message) > 8000:
        return {
            "answer": "That message is too long. Try sending a shorter version.",
            "feature": "too_long",
            "category": "none",
        }

    try:
        return route(message, req.user_hash)
    except Exception as e:
        print(f"chat error: {e}")
        return {
            "answer": "Something went wrong on my end. Please try again in a moment.",
            "feature": "error",
            "category": "error",
        }
