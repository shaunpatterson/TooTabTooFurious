// Content script to extract page metadata for better categorization

function extractPageMetadata() {
  const metadata = {
    // Basic info
    title: document.title,
    url: window.location.href,
    domain: window.location.hostname,
    
    // Meta tags
    description: '',
    keywords: '',
    author: '',
    ogTitle: '',
    ogDescription: '',
    ogType: '',
    ogSiteName: '',
    articleSection: '',
    articleTag: '',
    applicationName: '',
    generator: '',
    
    // Structured data
    schemaType: '',
    
    // Page content hints
    mainHeading: '',
    bodyText: '',
    linkDensity: {}
  };

  // Extract meta tags
  const metaTags = document.getElementsByTagName('meta');
  for (let meta of metaTags) {
    const name = meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    
    if (!name || !content) continue;
    
    switch(name.toLowerCase()) {
      case 'description':
        metadata.description = content.substring(0, 200);
        break;
      case 'keywords':
        metadata.keywords = content.substring(0, 100);
        break;
      case 'author':
        metadata.author = content.substring(0, 50);
        break;
      case 'og:title':
        metadata.ogTitle = content.substring(0, 100);
        break;
      case 'og:description':
        metadata.ogDescription = content.substring(0, 200);
        break;
      case 'og:type':
        metadata.ogType = content;
        break;
      case 'og:site_name':
        metadata.ogSiteName = content.substring(0, 50);
        break;
      case 'article:section':
        metadata.articleSection = content;
        break;
      case 'article:tag':
        metadata.articleTag = content;
        break;
      case 'application-name':
        metadata.applicationName = content.substring(0, 50);
        break;
      case 'generator':
        metadata.generator = content.substring(0, 50);
        break;
    }
  }

  // Extract schema.org structured data
  const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
  if (schemaScripts.length > 0) {
    try {
      const schemaData = JSON.parse(schemaScripts[0].textContent);
      metadata.schemaType = schemaData['@type'] || '';
    } catch (e) {
      // Invalid JSON, ignore
    }
  }

  // Get main heading (h1)
  const h1 = document.querySelector('h1');
  if (h1) {
    metadata.mainHeading = h1.textContent.substring(0, 100).trim();
  }

  // Get a sample of body text (first paragraph or main content)
  const mainContent = document.querySelector('main, article, [role="main"], .content, #content');
  if (mainContent) {
    const paragraphs = mainContent.querySelectorAll('p');
    if (paragraphs.length > 0) {
      metadata.bodyText = Array.from(paragraphs)
        .slice(0, 3)
        .map(p => p.textContent.trim())
        .join(' ')
        .substring(0, 300);
    }
  }

  // Analyze link patterns (what domains are linked to)
  const links = document.querySelectorAll('a[href]');
  const linkDomains = {};
  links.forEach(link => {
    try {
      const url = new URL(link.href);
      if (url.hostname && url.hostname !== window.location.hostname) {
        linkDomains[url.hostname] = (linkDomains[url.hostname] || 0) + 1;
      }
    } catch (e) {
      // Invalid URL, ignore
    }
  });
  
  // Get top 5 most linked domains
  metadata.linkDensity = Object.entries(linkDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((obj, [domain, count]) => {
      obj[domain] = count;
      return obj;
    }, {});

  return metadata;
}

// Listen for requests from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractMetadata') {
    const metadata = extractPageMetadata();
    sendResponse(metadata);
  }
  return true; // Keep channel open for async response
});