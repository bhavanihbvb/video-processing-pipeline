import os
import json

def export_code():
    project_root = r"c:\Users\bhava\OneDrive - Alliance University\Documents\Desktop\video_processing_pipeline"
    exclude_dirs = {'.git', 'venv', 'node_modules', '__pycache__', 'dist', 'build', 'downloads', 'frames'}
    exclude_exts = {'.pyc', '.mp4', '.mp3', '.jpg', '.png', '.log', '.lock'}
    
    code_data = []
    
    for root, dirs, files in os.walk(project_root):
        # modify dirs in-place to skip excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            # skip excluded extensions
            if any(file.endswith(ext) for ext in exclude_exts):
                continue
                
            # skip the output file itself
            if file in ['project_code.json', 'export_to_json.py', 'package-lock.json', 'queue.json', 'result.json'] or file.startswith('result_'):
                continue
                
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, project_root)
            # Use forward slashes for the path in JSON
            rel_path = rel_path.replace('\\', '/')
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    code_data.append({"file": rel_path, "content": f.read()})
            except UnicodeDecodeError:
                # skip binary files
                pass
                
    output_path = os.path.join(project_root, 'project_code.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(code_data, f, indent=2)
    print(f"Exported {len(code_data)} files to {output_path}")

if __name__ == '__main__':
    export_code()
