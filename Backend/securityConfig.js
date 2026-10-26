const LOCAL_ORIGINS = ["http://localhost:3000", "http://localhost:5173"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseOrigin(value, name, production) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid origin.`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash || value === '*') {
        throw new Error(`${name} must contain only an HTTP(S) origin.`);
    }
    if (production && parsed.protocol !== 'https:') {
        throw new Error(`${name} must use HTTPS in production.`);
    }
    return parsed.origin;
}

function createCorsOptions(env = process.env) {
    const production = String(env.NODE_ENV || '').toLowerCase() === 'production';
    const configuredOrigin = env.CLIENT_URL;
    if (production && !configuredOrigin) {
        throw new Error('CLIENT_URL is required in production.');
    }

    const configured = configuredOrigin
        ? parseOrigin(configuredOrigin, 'CLIENT_URL', production)
        : null;
    const allowedOrigins = new Set(production ? [configured] : [...LOCAL_ORIGINS, configured].filter(Boolean));

    return {
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        origin(origin, callback) {
            // Non-browser callers omit Origin and do not receive CORS headers.
            callback(null, !origin || allowedOrigins.has(origin));
        },
    };
}

function createPostgresConfig(connectionString, env = process.env) {
    let parsed;
    try {
        parsed = new URL(connectionString);
    } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
        throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLoopback = LOCAL_HOSTS.has(hostname);
    const production = String(env.NODE_ENV || '').toLowerCase() === 'production';
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'disable' && (!isLoopback || production)) {
        throw new Error('DATABASE_URL cannot disable TLS for this environment.');
    }

    // node-postgres lets connection-string SSL parameters replace the explicit
    // ssl object. Remove sslmode so the verified TLS policy below always wins.
    parsed.searchParams.delete('sslmode');
    for (const parameter of ['sslcert', 'sslkey', 'sslrootcert']) {
        if (parsed.searchParams.has(parameter)) {
            throw new Error(`DATABASE_URL ${parameter} is unsupported; configure TLS through the deployment environment.`);
        }
    }

    const useTls = production || !isLoopback || (sslMode && sslMode !== 'disable');
    return {
        connectionString: parsed.toString(),
        ssl: useTls ? { rejectUnauthorized: true } : false,
    };
}

function validateSupabaseUrl(value, env = process.env) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('SUPABASE_URL must be a valid URL.');
    }
    const production = String(env.NODE_ENV || '').toLowerCase() === 'production';
    const isLocal = LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
    const isAllowedProtocol = parsed.protocol === 'https:' || (!production && isLocal && parsed.protocol === 'http:');
    if (!isAllowedProtocol || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error('SUPABASE_URL must be an HTTPS origin (HTTP loopback is allowed only in development).');
    }
    return parsed.origin;
}

module.exports = { createCorsOptions, createPostgresConfig, validateSupabaseUrl };
