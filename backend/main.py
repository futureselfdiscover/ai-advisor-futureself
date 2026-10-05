import os
import sys
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

sys.path.append(str(Path(__file__).resolve().parent / "advisor"))
from router import route

app = FastAPI()

# Comma separated list of sites allowed to call this API from a browser.
origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared secret between the Vercel proxy and this API. When set, every /chat
# request must send it in the x-api-key header, so strangers can't run up
# the OpenAI bill. Leave it unset for local testing.
API_KEY = os.environ.get("BACKEND_API_KEY")


class Turn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    user_hash: Optional[str] = None
    history: Optional[List[Turn]] = None


@app.get("/")
def root():
    return {"message": "AI Advisor API is running"}


@app.post("/chat")
def chat(req: ChatRequest, x_api_key: Optional[str] = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")

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

    history = [{"role": t.role, "content": t.content} for t in (req.history or [])][-10:]

    try:
        return route(message, req.user_hash, history)
    except Exception as e:
        print(f"chat error: {e}")
        return {
            "answer": "Something went wrong on my end. Please try again in a moment.",
            "feature": "error",
            "category": "error",
        }
