import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASSWORD!,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const messages = client.fetch('1:*', { envelope: true, flags: true });
    const allEmails = [];

    for await (const message of messages) {
      allEmails.push({
        uid: message.uid,
        subject: message.envelope?.subject,
        from: message.envelope?.from,
        flags: message.flags ? Array.from(message.flags) : [],
      });
    }

    lock.release();
    return NextResponse.json({ success: true, count: allEmails.length, emails: allEmails });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    await client.logout();
  }
}
