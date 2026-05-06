import os
from pathlib import Path

# --- Paths ---
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
LOG_DIR  = BASE_DIR / "logs"
DB_PATH  = DATA_DIR / "jobs.db"

# --- Remotive API (free, no API key required) ---
# Docs: https://remotive.com/api/remote-jobs
REMOTIVE_BASE_URL = "https://remotive.com/api"
REMOTIVE_TIMEOUT  = 30

# --- We Work Remotely (free RSS feed, no key required) ---
# Automatically used — no setup needed.

# --- JSearch API via RapidAPI (LinkedIn + Indeed + Glassdoor jobs) ---
# Sign up free at https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
# Free tier: 200 requests/month. Leave empty to skip LinkedIn search.
JSEARCH_API_KEY = os.environ.get("JSEARCH_API_KEY", "")

# Search queries: list of (search_term, location) tuples.
SEARCH_QUERIES = [
    ("Java Backend Developer",   "United States"),
    ("Technical Lead Java",      "United States"),
    ("AI Agent Developer",       "United States"),
    ("Spring Boot Developer",    "United States"),
]

# --- Groq API (free, fast) ---
# Add keys as Railway environment variables: GROQ_API_KEY, GROQ_API_KEY_2 ... GROQ_API_KEY_6
# Each key = 100k tokens/day → 6 keys = 600k tokens/day total.
GROQ_API_KEYS = list(filter(None, [
    os.environ.get("GROQ_API_KEY", ""),
    os.environ.get("GROQ_API_KEY_2", ""),
    os.environ.get("GROQ_API_KEY_3", ""),
    os.environ.get("GROQ_API_KEY_4", ""),
    os.environ.get("GROQ_API_KEY_5", ""),
    os.environ.get("GROQ_API_KEY_6", ""),
]))
GROQ_API_KEY = GROQ_API_KEYS[0] if GROQ_API_KEYS else ""  # backward compat
GROQ_MODEL   = "llama-3.3-70b-versatile"

# Jobs scoring >= this threshold get a drafted email
SCORE_THRESHOLD = 7

# Max jobs to score per pipeline run (prevents exhausting Groq free-tier 100k TPD limit)
MAX_JOBS_PER_RUN = int(os.environ.get("MAX_JOBS_PER_RUN", "20"))

# --- Gmail SMTP ---
# Generate an App Password: Google Account → Security → 2-Step Verification → App Passwords
# Remove the spaces when pasting: "xxxx xxxx xxxx xxxx" → "xxxxxxxxxxxxxxxx"
GMAIL_ADDRESS      = os.environ.get("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

# --- Resume ---
# Auto-populated from portfolio at shabaz-portfolio (About, Experience, Skills components).
RESUME_TEXT = """
Mohammed Shabaz Amin
Email: shabazameenmd@gmail.com | Official: mohammed.shabazamin@hcltech.com
Phone: +91 7798861341 | Location: Hyderabad, India

SUMMARY:
Results-driven Java Backend Developer & Technical Lead with 10+ years of combined experience
in enterprise software development and AI agent engineering. Currently leading high-impact
projects at HCLTech for client Verizon Communications, delivering automation solutions that
dramatically reduce operational overhead. Specializing in Microservices architecture,
Event-Driven systems (Apache Kafka), and autonomous AI agent development using LangChain,
Claude AI, and RAG pipelines. Passionate about clean code, scalable distributed systems,
and LLM orchestration.

CORE SKILLS:
Backend:       Core Java 1.8, Spring Boot, Spring MVC, Hibernate, J2EE, JSP
Messaging:     Apache Kafka, Kafka Streams, Event-Driven Architecture
Cloud:         AWS, Microservices, CQRS, Saga Pattern, Event Sourcing
Database:      MS SQL Server, Oracle DB, JDBC
AI & LLM:     Prompt Engineering, Claude AI, ChatGPT, Google Gemini, LangChain,
               RAG, Multi-Agent Systems, AI Agent Development
Frontend:      JavaScript, HTML, CSS
Process:       SCRUM / Agile, Maven, Design Patterns, ITSM

EXPERIENCE:

Technical Lead — HCLTech | Client: Verizon Communications INC | March 2025 – Present
- Leading backend teams for Verizon's enterprise automation solutions
- Architected Incident Management Automation system reducing manual effort by 60%
- Designed Repeat Call Analyzer using Spring Boot & Apache Kafka for pattern detection
- Integrated ITSM platforms with monitoring tools for SLA compliance
- Implemented CQRS & Saga Design Patterns for distributed microservices
- Tech: Spring Boot, Apache Kafka, Kafka Streams, AWS, MS SQL Server, Spring MVC

Java Backend Developer — Synergiz Global Services | Client: Mumbai Metro Railway (MRVC)
December 2022 – August 2023
- Built PMIS (Project Management & Information System) for Mumbai Metro Railway
- Engineered SynTrack Engine integrating MS Excel, Primavera P6, and Tally data sources
- Developed visual dashboards for real-time project tracking
- Implemented event-driven data pipelines using Apache Kafka
- Full Stack development: JSP, Spring MVC, J2EE, Core Java
- Tech: JSP, JavaScript, J2EE, Core Java, Spring MVC, Apache Kafka, JDBC, AWS

Junior Lecturer — AAJC, Nanded | December 2012 – September 2019
- 7 years teaching Computer Science fundamentals, data structures, and algorithms
- Mentored hundreds of students in software development concepts

EDUCATION:
B.Tech — Computer Science, SCET Hyderabad (2008 – 2012)

AI AGENT PROJECTS:
- Built 4+ autonomous AI agents using LangChain, Claude AI, RAG, Multi-Agent Systems
- ArshezAI HR Agent: AI-powered HR automation platform
- Specializing in LLM orchestration and autonomous decision-making systems
"""

# --- App Login ---
APP_USERNAME = os.environ.get("APP_USERNAME", "shabaz")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")

# --- Logging ---
LOG_LEVEL = "INFO"   # DEBUG | INFO | WARNING | ERROR
