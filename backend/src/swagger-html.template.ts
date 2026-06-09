export function generateHtmlDocs(spec: any): string {
  // Mock JSON generator based on OpenAPI schema definitions
  function getMockJson(schema: any): any {
    if (!schema) return null;

    // Resolve references
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      const refSchema = spec.components?.schemas?.[refName];
      return getMockJson(refSchema);
    }

    if (schema.type === 'object') {
      const obj: any = {};
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          obj[key] = getMockJson(value);
        }
      }
      return obj;
    }

    if (schema.type === 'array') {
      return [getMockJson(schema.items)];
    }

    if (schema.enum && schema.enum.length > 0) {
      return schema.enum[0];
    }

    if (schema.type === 'string') {
      if (schema.format === 'date-time' || schema.format === 'date') {
        return new Date().toISOString();
      }
      return 'string';
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      return 0;
    }

    if (schema.type === 'boolean') {
      return true;
    }

    return null;
  }

  // Parse OpenAPI paths into structured data for rendering
  const groups: { [key: string]: any[] } = {};

  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (method === 'parameters') continue;

        const op = operation as any;
        const tag = op.tags?.[0] || 'General';

        if (!groups[tag]) {
          groups[tag] = [];
        }

        // Generate Request mock JSON
        let requestMock = null;
        if (op.requestBody?.content?.['application/json']?.schema) {
          requestMock = getMockJson(
            op.requestBody.content['application/json'].schema,
          );
        }

        // Generate Response mock JSON (find 200 or 201 response)
        let responseMock = null;
        let responseStatus = '200';
        const successResponse =
          op.responses?.['200'] ||
          op.responses?.['210'] ||
          op.responses?.['201'];
        if (successResponse) {
          if (op.responses?.['201']) responseStatus = '201';
          if (successResponse.content?.['application/json']?.schema) {
            responseMock = getMockJson(
              successResponse.content['application/json'].schema,
            );
          } else {
            responseMock = { message: 'Success' };
          }
        } else if (op.responses?.['204']) {
          responseStatus = '204';
          responseMock = null; // No Content
        }

        groups[tag].push({
          path,
          method: method.toUpperCase(),
          summary: op.summary || op.description || '',
          description: op.description || '',
          operationId: op.operationId,
          parameters: op.parameters || [],
          security: op.security || [],
          requestMock,
          responseMock,
          responseStatus,
        });
      }
    }
  }

  // Sort groups alphabetically
  const sortedTags = Object.keys(groups).sort();

  // Serialize paths data for client-side searching
  const clientData = JSON.stringify(groups);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CMMS API Developer Manual</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-main: #090d16;
      --bg-sidebar: #0e1322;
      --border-color: rgba(255, 255, 255, 0.06);
      --text-main: #e2e8f0;
      --text-headings: #ffffff;
      --text-muted: #64748b;
      --primary: #4f46e5;
      --primary-hover: #6366f1;
      
      --color-get: #10b981;
      --color-post: #3b82f6;
      --color-put: #f59e0b;
      --color-delete: #ef4444;
      --color-patch: #8b5cf6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-main);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      line-height: 1.5;
      display: flex;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Sidebar Navigation */
    .sidebar {
      width: 280px;
      background-color: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      height: 100vh;
      position: fixed;
      top: 0;
      left: 0;
      display: flex;
      flex-direction: column;
      z-index: 10;
    }
    
    .sidebar-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .logo-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 0.95rem;
    }
    
    .logo-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-headings);
    }
    
    .search-box {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0.4rem 0.75rem;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-box:focus {
      border-color: var(--primary);
    }

    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem 1rem;
    }
    
    .nav-section {
      margin-bottom: 1.5rem;
    }
    
    .nav-section-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      padding-left: 0.5rem;
      font-weight: 600;
    }
    
    .nav-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      color: var(--text-main);
      text-decoration: none;
      font-size: 0.875rem;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }
    
    .nav-link:hover {
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-headings);
    }

    .nav-link.active {
      background: rgba(79, 70, 229, 0.1);
      color: #a5b4fc;
      font-weight: 500;
    }
    
    .nav-method {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      min-width: 45px;
      text-align: center;
    }
    
    .nav-method.GET { background: rgba(16, 185, 129, 0.1); color: var(--color-get); }
    .nav-method.POST { background: rgba(59, 130, 246, 0.1); color: var(--color-post); }
    .nav-method.PUT { background: rgba(245, 158, 11, 0.1); color: var(--color-put); }
    .nav-method.DELETE { background: rgba(239, 68, 68, 0.1); color: var(--color-delete); }
    .nav-method.PATCH { background: rgba(139, 92, 246, 0.1); color: var(--color-patch); }

    /* Main Content Area */
    .content-area {
      margin-left: 280px;
      flex: 1;
      min-width: 0;
    }

    /* Page Intro */
    .intro-section {
      max-width: 1100px;
      padding: 3rem 4rem 2rem 4rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    .intro-title {
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--text-headings);
      margin-bottom: 1rem;
      letter-spacing: -0.02em;
    }
    
    .intro-text {
      color: var(--text-muted);
      font-size: 1.1rem;
      margin-bottom: 1.5rem;
      max-width: 800px;
    }

    /* Auth panel */
    .auth-panel {
      background: rgba(79, 70, 229, 0.05);
      border: 1px solid rgba(79, 70, 229, 0.2);
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2rem;
    }
    
    .auth-panel-title {
      color: var(--text-headings);
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .auth-panel-text {
      font-size: 0.9rem;
      color: var(--text-main);
      line-height: 1.6;
    }
    
    .code-inline {
      background: rgba(255, 255, 255, 0.08);
      font-family: 'Fira Code', monospace;
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
      font-size: 0.85em;
      color: #cbd5e1;
    }

    /* API Endpoint Documentation Sections */
    .endpoint-block {
      display: flex;
      border-bottom: 1px solid var(--border-color);
    }
    
    .endpoint-left {
      flex: 1;
      padding: 3rem 4rem;
      min-width: 0;
    }
    
    .endpoint-right {
      width: 480px;
      background: #06090f;
      border-left: 1px solid var(--border-color);
      padding: 3rem 2rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
      position: sticky;
      top: 0;
      align-self: flex-start;
      height: 100vh;
      overflow-y: auto;
    }
    
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    
    .badge-method {
      font-size: 0.8rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      color: white;
    }
    
    .badge-method.GET { background-color: var(--color-get); }
    .badge-method.POST { background-color: var(--color-post); }
    .badge-method.PUT { background-color: var(--color-put); }
    .badge-method.DELETE { background-color: var(--color-delete); }
    .badge-method.PATCH { background-color: var(--color-patch); }
    
    .endpoint-path {
      font-family: 'Fira Code', monospace;
      font-size: 1.1rem;
      color: var(--text-headings);
      font-weight: 500;
      word-break: break-all;
    }
    
    .badge-auth {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: var(--text-main);
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    
    .endpoint-summary {
      font-size: 1.2rem;
      color: var(--text-headings);
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    
    .endpoint-description {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    
    /* Tables for parameters */
    .table-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    
    .params-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 2rem;
    }
    
    .params-table th {
      text-align: left;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--text-muted);
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
    }
    
    .params-table td {
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      vertical-align: top;
      font-size: 0.9rem;
    }
    
    .param-name {
      font-family: 'Fira Code', monospace;
      color: var(--text-headings);
      font-weight: 500;
    }
    
    .param-type {
      font-family: 'Fira Code', monospace;
      font-size: 0.75rem;
      color: var(--primary-hover);
      margin-left: 0.5rem;
    }
    
    .param-req {
      color: #ef4444;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.5rem;
    }
    
    .param-in {
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      color: var(--text-muted);
      margin-left: 0.5rem;
    }
    
    .param-desc {
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* Code Panel Container */
    .code-box-title {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    
    .code-block {
      background: #090d16;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      font-family: 'Fira Code', monospace;
      font-size: 0.8rem;
      color: #cbd5e1;
      max-height: 300px;
    }
    
    .code-block pre {
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    .response-status-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: rgba(16, 185, 129, 0.1);
      color: var(--color-get);
      margin-left: 0.75rem;
    }
    .response-status-badge.status-201 {
      background: rgba(59, 130, 246, 0.1);
      color: var(--color-post);
    }
    .response-status-badge.status-204 {
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    /* Responsive */
    @media (max-width: 1200px) {
      .endpoint-block {
        flex-direction: column;
      }
      .endpoint-right {
        width: 100%;
        border-left: none;
        border-top: 1px solid var(--border-color);
        height: auto;
        position: static;
        padding: 2rem 4rem 3rem 4rem;
      }
    }
    @media (max-width: 768px) {
      body {
        flex-direction: column;
      }
      .sidebar {
        width: 100%;
        height: auto;
        position: static;
        border-right: none;
        border-bottom: 1px solid var(--border-color);
      }
      .content-area {
        margin-left: 0;
      }
      .intro-section, .endpoint-left, .endpoint-right {
        padding: 2rem 1.5rem;
      }
    }
  </style>
</head>
<body>

  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="logo-container">
        <div class="logo-icon">AI</div>
        <div class="logo-title">AssetIntel CMMS</div>
      </div>
      <input type="text" class="search-box" id="search-input" placeholder="Search endpoints..." oninput="filterEndpoints()">
    </div>
    <div class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-section-title">Getting Started</div>
        <a href="#overview" class="nav-link">Overview & Base URL</a>
        <a href="#authentication" class="nav-link">Authentication</a>
      </div>
      
      ${sortedTags
        .map(
          (tag) => `
        <div class="nav-section" id="nav-tag-${tag.replace(/\s+/g, '-')}">
          <div class="nav-section-title">${tag}</div>
          ${groups[tag]
            .map((endpoint) => {
              const anchor = `${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[\/\{\}]/g, '-').replace(/-+/g, '-')}`;
              return `
              <a href="#${anchor}" class="nav-link" data-path="${endpoint.path}" data-summary="${endpoint.summary}" data-tag="${tag}">
                <span class="nav-method ${endpoint.method}">${endpoint.method}</span>
                <span style="font-family: 'Fira Code', monospace; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${endpoint.path.replace('/api/v1', '')}</span>
              </a>
            `;
            })
            .join('')}
        </div>
      `,
        )
        .join('')}
    </div>
  </aside>

  <main class="content-area">
    <section class="intro-section" id="overview">
      <h1 class="intro-title">CMMS API Specification</h1>
      <p class="intro-text">
        Welcome to the AssetIntel Computerized Maintenance Management System (CMMS) Backend Developer reference document. 
        Use this static resource to understand routes, path structures, parameters, and payloads.
      </p>
      
      <div class="table-title">Base Server URL</div>
      <div class="code-block" style="margin-bottom: 2rem; max-width: 500px;">
        <pre>http://localhost:3000</pre>
      </div>
    </section>
    
    <section class="intro-section" id="authentication" style="border-bottom: 2px solid var(--border-color); padding-top: 1rem;">
      <h2 class="intro-title" style="font-size: 1.75rem;">Authentication</h2>
      <div class="auth-panel">
        <div class="auth-panel-title">🔐 JWT Authentication Required</div>
        <p class="auth-panel-text">
          Except for the login endpoint, all API requests require a JSON Web Token (JWT) sent in the HTTP authorization header:
          <br><br>
          <span class="code-inline">Authorization: Bearer &lt;accessToken&gt;</span>
          <br><br>
          To authenticate:
          <ol style="margin-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
            <li>Make a <strong>POST</strong> request to <span class="code-inline">/api/v1/auth/login</span> with your credentials.</li>
            <li>Copy the returned <span class="code-inline">accessToken</span>.</li>
            <li>Add the HTTP Header <span class="code-inline">Authorization</span> with value <span class="code-inline">Bearer &lt;your_token&gt;</span> to all subsequent requests.</li>
          </ol>
        </p>
      </div>
    </section>

    <!-- Endpoints List -->
    <div id="endpoints-list-container">
      ${sortedTags
        .map(
          (tag) => `
        <div class="tag-group-container" id="group-tag-${tag.replace(/\s+/g, '-')}">
          ${groups[tag]
            .map((endpoint) => {
              const anchor = `${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[\/\{\}]/g, '-').replace(/-+/g, '-')}`;
              const requiresAuth =
                endpoint.security.length > 0 ||
                (endpoint.path !== '/api/v1/auth/login' &&
                  endpoint.path !== '/api/v1/auth/refresh');
              return `
              <div class="endpoint-block" id="${anchor}" data-search-blob="${endpoint.method} ${endpoint.path} ${endpoint.summary} ${tag}">
                
                <!-- Documentation Details (Left Panel) -->
                <div class="endpoint-left">
                  <div class="endpoint-header">
                    <span class="badge-method ${endpoint.method}">${endpoint.method}</span>
                    <span class="endpoint-path">${endpoint.path}</span>
                    ${
                      requiresAuth
                        ? `
                      <span class="badge-auth">🔐 Auth Required</span>
                    `
                        : `
                      <span class="badge-auth" style="border-color: rgba(16, 185, 129, 0.2); color: var(--color-get);">🔓 Public</span>
                    `
                    }
                  </div>
                  
                  <div class="endpoint-summary">${endpoint.summary}</div>
                  ${
                    endpoint.description &&
                    endpoint.description !== endpoint.summary
                      ? `
                    <div class="endpoint-description">${endpoint.description}</div>
                  `
                      : ''
                  }
                  
                  <!-- Parameters Section -->
                  ${
                    endpoint.parameters.length > 0
                      ? `
                    <div class="table-title">Parameters</div>
                    <table class="params-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${endpoint.parameters
                          .map(
                            (param: any) => `
                          <tr>
                            <td>
                              <span class="param-name">${param.name}</span>
                              <span class="param-type">${param.schema?.type || 'string'}</span>
                              ${param.required ? '<span class="param-req">required</span>' : ''}
                              <span class="param-in">${param.in}</span>
                            </td>
                            <td class="param-desc">${param.description || 'No description provided.'}</td>
                          </tr>
                        `,
                          )
                          .join('')}
                      </tbody>
                    </table>
                  `
                      : ''
                  }
                </div>
                
                <!-- Payload Examples (Right Panel) -->
                <div class="endpoint-right">
                  
                  <!-- Request Payload Example -->
                  ${
                    endpoint.requestMock
                      ? `
                    <div>
                      <div class="code-box-title">Request Body Example (JSON)</div>
                      <div class="code-block">
                        <pre><code>${JSON.stringify(endpoint.requestMock, null, 2)}</code></pre>
                      </div>
                    </div>
                  `
                      : `
                    <div>
                      <div class="code-box-title">Request Body</div>
                      <div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No request body payload.</div>
                    </div>
                  `
                  }
                  
                  <!-- Response Payload Example -->
                  <div>
                    <div class="code-box-title" style="display:flex; justify-content:space-between; align-items:center;">
                      <span>Expected Response</span>
                      <span class="response-status-badge status-${endpoint.responseStatus}">${endpoint.responseStatus} ${endpoint.responseStatus === '204' ? 'No Content' : endpoint.responseStatus === '201' ? 'Created' : 'OK'}</span>
                    </div>
                    ${
                      endpoint.responseMock
                        ? `
                      <div class="code-block" style="margin-top:0.5rem;">
                        <pre><code>${JSON.stringify(endpoint.responseMock, null, 2)}</code></pre>
                      </div>
                    `
                        : `
                      <div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; margin-top:0.5rem;">No response payload returned.</div>
                    `
                    }
                  </div>
                  
                </div>
                
              </div>
            `;
            })
            .join('')}
        </div>
      `,
        )
        .join('')}
    </div>
  </main>

  <script>
    // Simple client-side search filtering
    function filterEndpoints() {
      const query = document.getElementById('search-input').value.toLowerCase().trim();
      const blocks = document.querySelectorAll('.endpoint-block');
      const tags = ${JSON.stringify(sortedTags)};
      
      // Keep track of which tags still have visible children
      const tagCounts = {};
      tags.forEach(t => tagCounts[t] = 0);
      
      blocks.forEach(block => {
        const blob = block.getAttribute('data-search-blob').toLowerCase();
        const tag = block.getAttribute('data-search-blob').split(' ').pop(); // last element is tag
        
        if (blob.includes(query)) {
          block.style.display = 'flex';
          
          // Find matching tag inside parent mapping
          for (let t of tags) {
            if (blob.includes(t.toLowerCase())) {
              tagCounts[t]++;
              break;
            }
          }
        } else {
          block.style.display = 'none';
        }
      });
      
      // Hide empty sidebar sections & empty main container tags
      tags.forEach(tag => {
        const cleanTag = tag.replace(/\\s+/g, '-');
        const sidebarSec = document.getElementById('nav-tag-' + cleanTag);
        const groupContainer = document.getElementById('group-tag-' + cleanTag);
        
        if (tagCounts[tag] === 0 && query !== '') {
          if (sidebarSec) sidebarSec.style.display = 'none';
          if (groupContainer) groupContainer.style.display = 'none';
        } else {
          if (sidebarSec) sidebarSec.style.display = 'block';
          if (groupContainer) groupContainer.style.display = 'block';
        }
      });
    }

    // Scroll Spy active navigation highlight
    window.addEventListener('DOMContentLoaded', () => {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const id = entry.target.getAttribute('id');
          if (entry.intersectionRatio > 0) {
            document.querySelectorAll('.nav-link').forEach(link => {
              if (link.getAttribute('href') === '#' + id) {
                link.classList.add('active');
              } else {
                link.classList.remove('active');
              }
            });
          }
        });
      }, {
        rootMargin: '-20% 0px -70% 0px'
      });

      // Track all endpoint blocks and introductory sections
      document.querySelectorAll('.endpoint-block, .intro-section').forEach(section => {
        observer.observe(section);
      });
    });
  </script>
</body>
</html>`;
}
