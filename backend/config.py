from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    # Free tier providers
    groq_api_key: str = ""          # free at console.groq.com
    ollama_base_url: str = "http://localhost:11434"  # local Ollama instance
    workspace_dir: str = "workspace"
    allowed_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
