function extractRegistrableDomain(hostname) {
  hostname = hostname.toLowerCase().replace(/^www\./, '');
  return hostname;
}

function domainMatches(urlHostname, blockedDomain) {
  const host = urlHostname.toLowerCase();
  const domain = blockedDomain.toLowerCase().replace(/^www\./, '');
  if (host === domain || host === 'www.' + domain) return true;
  if (host.endsWith('.' + domain)) return true;
  return false;
}

function isUrlBlocked(url, blockedDomains, allowlist) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  for (const allowed of allowlist) {
    if (domainMatches(hostname, allowed)) return false;
  }

  for (const domain of blockedDomains) {
    if (domainMatches(hostname, domain)) return true;
  }

  return false;
}

function getEffectiveBlocklist(schedule, lists) {
  const domains = new Set();

  if (schedule.adHocSites) {
    for (const site of schedule.adHocSites) {
      domains.add(site.toLowerCase().replace(/^www\./, ''));
    }
  }

  if (schedule.listIds) {
    for (const listId of schedule.listIds) {
      const list = lists.find(l => l.id === listId);
      if (list && list.sites) {
        for (const site of list.sites) {
          domains.add(site.toLowerCase().replace(/^www\./, ''));
        }
      }
    }
  }

  return [...domains];
}
