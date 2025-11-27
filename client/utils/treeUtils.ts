import { ScriptFile, TreeItem } from '../types';

export const buildScriptTree = (scripts: ScriptFile[]): TreeItem[] => {
  const rootItems: TreeItem[] = [];
  const map = new Map<string, TreeItem>();

  // Helper to find or create folder
  const getOrCreateFolder = (pathParts: string[], parentPath: string): TreeItem[] => {
    if (pathParts.length === 0) return rootItems;

    const currentPart = pathParts[0];
    const fullPath = parentPath ? `${parentPath}/${currentPart}` : currentPart;
    
    let folder = map.get(fullPath);

    if (!folder) {
      folder = {
        id: `folder-${fullPath}`,
        name: currentPart,
        type: 'folder',
        path: fullPath,
        children: [],
        isOpen: true // Default open
      };
      map.set(fullPath, folder);

      const parentList = pathParts.length > 1 
        ? getOrCreateFolder(pathParts.slice(0, -1), "") // This logic is simplified; in a real recursive builder we'd need parent ref
        : null; 
        
      // Re-approach: iterative builder is safer for paths
    }
    return [];
  };

  // 2nd Approach: Single pass with object reference
  const root: TreeItem = { id: 'root', name: 'root', type: 'folder', path: '', children: [] };
  
  scripts.forEach(script => {
    const parts = script.path ? script.path.split('/') : [];
    let currentLevel = root.children!;
    
    // Navigate/Create folders
    parts.forEach((part, index) => {
      let folder = currentLevel.find(item => item.name === part && item.type === 'folder');
      
      if (!folder) {
        folder = {
          id: `folder-${Math.random().toString(36).substr(2, 9)}`,
          name: part,
          type: 'folder',
          path: parts.slice(0, index + 1).join('/'),
          children: [],
          isOpen: true
        };
        currentLevel.push(folder);
      }
      currentLevel = folder.children!;
    });

    // Add File
    currentLevel.push({
      id: script.id,
      name: script.name,
      type: 'file',
      path: script.path,
      data: script
    });
  });

  // Sort: Folders first (alphabetical), Files by semantic version ascending then name
  const parseVersion = (v?: string): number[] => {
    const s = String(v || '').trim();
    if (!s) return [];
    return s.split('.').map(x => {
      const n = parseInt(x, 10);
      return isNaN(n) ? 0 : n;
    });
  };
  const cmpVersion = (a?: string, b?: string): number => {
    const A = parseVersion(a);
    const B = parseVersion(b);
    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i++) {
      const ai = A[i] || 0;
      const bi = B[i] || 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  };
  const sortTree = (items: TreeItem[]) => {
    items.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'folder') return a.name.localeCompare(b.name);
      if (a.type === 'file' && b.type === 'file') {
        const va = a.data?.version || '';
        const vb = b.data?.version || '';
        const byVer = cmpVersion(va, vb);
        if (byVer !== 0) return byVer;
        return a.name.localeCompare(b.name);
      }
      return a.type === 'folder' ? -1 : 1;
    });
    items.forEach(item => {
      if (item.children) sortTree(item.children);
    });
  };

  sortTree(root.children || []);
  return root.children || [];
};
