import { app } from './app';
import { env } from './env';

app.listen(env.port, () => console.log(`SportHub API: http://localhost:${env.port}  (docs: /docs)`));
