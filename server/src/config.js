import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// The shared project .env lives one level above server/, independent of npm's cwd.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
