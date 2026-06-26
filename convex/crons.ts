import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval(
  'check-email-inbox',
  { minutes: 5 }, // Se ejecuta cada 5 minutos
  internal.emails.checkInbox
);

export default crons;
