const nodemailer = require('nodemailer');

async function main() {
  const transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: 'pcqgep3m2o7n354z@ethereal.email', pass: 'K92VmVkvrxScaSnF5K' }
  });

  const info = await transport.sendMail({
    from: 'John Customer <john.customer@example.com>',
    to: 'pcqgep3m2o7n354z@ethereal.email',
    subject: '[HELPDESK] Cannot access the portal',
    text: [
      'Category: Technical',
      'Priority: High',
      '',
      '---',
      'I have been unable to log into the support portal since this morning.',
      'Getting error 500 on the login page.',
      '',
      'Steps:',
      '1. Go to /login',
      '2. Enter credentials',
      '3. Click Sign In -> Error 500',
    ].join('\n'),
  });

  console.log('Sent! Message-ID:', info.messageId);
  console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
}

main().catch(console.error);
