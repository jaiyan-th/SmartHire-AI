import os
import sys
import urllib.parse
from pathlib import Path
from datetime import timedelta
import dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from either backend/.env or project-root .env
dotenv.load_dotenv(BASE_DIR / '.env')
dotenv.load_dotenv(BASE_DIR.parent / '.env')
dotenv.load_dotenv(BASE_DIR.parent.parent / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'smarthire-ai-dev-key-override-in-prod-2026-x9k2')
DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 't')
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,0.0.0.0,testserver').split(',')
    if host.strip()
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',

    # SmartHire AI domain apps
    'apps.accounts',
    'apps.resumes',
    'apps.interviews',
    'apps.evaluations',
    'apps.analytics',
    'apps.reports',
    'apps.core',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'apps.core.middleware.RequestCorrelationAndSecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database Setup: Neon PostgreSQL / PostgreSQL in production, SQLite fallback for zero-friction local dev
DATABASE_URL = os.getenv('DATABASE_URL')
DATABASE_URL_UNPOOLED = os.getenv('DATABASE_URL_UNPOOLED')
DATABASE_ENGINE = os.getenv('DATABASE_ENGINE', '').lower()

# When running tests, use fast in-memory SQLite to isolate tests and protect cloud DB.
# When running migrations, Neon best practice recommends direct (unpooled) connection.
is_test_command = 'test' in sys.argv
is_migration_command = any(cmd in sys.argv for cmd in ('migrate', 'makemigrations', 'showmigrations', 'sqlmigrate'))

if is_test_command:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
elif DATABASE_URL:
    url_to_use = DATABASE_URL
    if is_migration_command:
        if DATABASE_URL_UNPOOLED:
            url_to_use = DATABASE_URL_UNPOOLED
        elif '-pooler.' in DATABASE_URL:
            url_to_use = DATABASE_URL.replace('-pooler.', '.')

    parsed = urllib.parse.urlparse(url_to_use)
    query_params = urllib.parse.parse_qs(parsed.query)

    db_options = {
        'connect_timeout': int(os.getenv('DATABASE_CONNECT_TIMEOUT', '10')),
        'keepalives': 1,
        'keepalives_idle': 30,
        'keepalives_interval': 10,
        'keepalives_count': 5,
    }
    if 'sslmode' in query_params:
        db_options['sslmode'] = query_params['sslmode'][0]
    elif 'neon.tech' in (parsed.hostname or ''):
        db_options['sslmode'] = 'require'

    if 'channel_binding' in query_params:
        db_options['channel_binding'] = query_params['channel_binding'][0]

    is_pooled = '-pooler' in (parsed.hostname or '')
    # For PgBouncer pooled connections, CONN_MAX_AGE=0 prevents holding pooler connections
    conn_max_age = 0 if is_pooled else int(os.getenv('DATABASE_CONN_MAX_AGE', '60'))

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': parsed.path.lstrip('/') or 'neondb',
            'USER': urllib.parse.unquote(parsed.username) if parsed.username else '',
            'PASSWORD': urllib.parse.unquote(parsed.password) if parsed.password else '',
            'HOST': parsed.hostname or 'localhost',
            'PORT': parsed.port or 5432,
            'OPTIONS': db_options,
            'CONN_MAX_AGE': conn_max_age,
            'CONN_HEALTH_CHECKS': True,
            # Disable server-side cursors on PgBouncer transaction poolers
            'DISABLE_SERVER_SIDE_CURSORS': is_pooled,
        }
    }
elif DATABASE_ENGINE == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('POSTGRES_DB', 'smarthire_db'),
            'USER': os.getenv('POSTGRES_USER', 'smarthire_user'),
            'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'smarthire_secure_password'),
            'HOST': os.getenv('POSTGRES_HOST', 'localhost'),
            'PORT': os.getenv('POSTGRES_PORT', '5432'),
            'CONN_MAX_AGE': int(os.getenv('DATABASE_CONN_MAX_AGE', '60')),
            'OPTIONS': {'sslmode': os.getenv('POSTGRES_SSLMODE', 'prefer')},
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024  # 12 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10 MB

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/minute',
        'user': '300/minute',
        'auth_login': '15/minute',
        'auth_register': '10/minute',
        'ai_ops': '40/minute',
    },
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'SmartHire AI Platform API',
    'DESCRIPTION': 'Production REST API for SmartHire AI Mock Interview & Candidate Assessment Platform',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# SimpleJWT Settings with Refresh Token Rotation & Blacklisting
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=120),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS Configuration — explicit allowlist
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000'
    ).split(',')
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CSRF_TRUSTED_ORIGINS',
        'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000'
    ).split(',')
    if origin.strip()
]

# Security Headers
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'SAMEORIGIN'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
if not DEBUG:
    if SECRET_KEY == 'smarthire-ai-dev-key-override-in-prod-2026-x9k2':
        import django.core.exceptions
        raise django.core.exceptions.ImproperlyConfigured(
            'DJANGO_SECRET_KEY must be set to a secure unique random key in production when DJANGO_DEBUG=False.'
        )
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() == 'true'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Cache Configuration (Redis Cache with fast local memory fallback)
REDIS_URL = os.getenv('REDIS_URL')
USE_REDIS_CACHE = os.getenv('USE_REDIS_CACHE', 'False').lower() in ('true', '1')
if not is_test_command and USE_REDIS_CACHE and REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'KEY_PREFIX': 'smarthire',
            'TIMEOUT': 300,
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'smarthire-local-cache',
            'TIMEOUT': 300,
        }
    }

# Celery & Redis Configuration (runs eagerly if CELERY_TASK_ALWAYS_EAGER=True for local dev without Redis)
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
CELERY_TASK_ALWAYS_EAGER = os.getenv('CELERY_TASK_ALWAYS_EAGER', 'True').lower() in ('true', '1', 't')
CELERY_TASK_EAGER_PROPAGATES = True

# Email Integration (SMTP when EMAIL_HOST is configured; console output in local dev)
EMAIL_HOST = os.getenv('EMAIL_HOST', '').strip()
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587') or '587')
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '').strip()
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '').strip()
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 't')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'SmartHire AI <noreply@smarthire.local>')
if EMAIL_HOST:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Structured Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'structured': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'structured',
        },
    },
    'loggers': {
        'smarthire': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
