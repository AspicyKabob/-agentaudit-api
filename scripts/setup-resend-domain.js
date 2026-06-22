#!/usr/bin/env node
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const DOMAIN = process.env.RESEND_DOMAIN || 'agentaudit.online';

async function main() {
  console.log(`Setting up Resend domain: ${DOMAIN}`);

  let domain = null;
  let createError = null;

  try {
    const { data, error } = await resend.domains.create({ name: DOMAIN });
    if (error) {
      createError = error;
    } else {
      domain = data;
    }
  } catch (err) {
    createError = err;
  }

  const isDuplicate = createError && (
    createError.statusCode === 409 ||
    /already exists|registered already/.test(createError.message || '')
  );

  if (isDuplicate) {
    console.log('Domain already exists; retrieving existing domains...');
    const { data, error } = await resend.domains.list();
    if (error) {
      console.error('Failed to list domains:', error);
      process.exit(1);
    }
    const list = Array.isArray(data) ? data : data?.data;
    const existing = list?.find((d) => d.name === DOMAIN);
    if (!existing) {
      console.error('Domain not found in Resend account');
      process.exit(1);
    }
    const { data: detail, error: detailError } = await resend.domains.get(existing.id);
    if (detailError) {
      console.error('Failed to retrieve domain details:', detailError);
      process.exit(1);
    }
    domain = detail?.data || detail;
  } else if (createError) {
    console.error('Failed to create domain:', createError);
    process.exit(1);
  }

  console.log('\nDomain ID:', domain.id);
  console.log('Domain:', domain.name);
  console.log('Status:', domain.status);
  console.log('\nDNS records to add:\n');

  const records = domain.records || [];
  if (records.length === 0) {
    console.log('No records returned. You may need to retrieve them from the Resend dashboard.');
  } else {
    console.log('Type | Host | Value | Priority');
    console.log('-----|------|-------|----------');
    for (const r of records) {
      console.log(`${r.type} | ${r.host || r.record} | ${r.value} | ${r.priority || '-'}`);
    }
  }

  console.log('\nAfter adding these records, verify the domain in the Resend dashboard or by re-running this script once DNS propagates.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
