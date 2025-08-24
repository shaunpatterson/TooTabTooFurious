#!/usr/bin/env python3
"""
Deploy Fine-tuned Model to Chrome Extension
Handles model deployment and integration with the extension
"""

import os
import json
import shutil
import argparse
from pathlib import Path
import subprocess

class ModelDeployer:
    """Deploy fine-tuned model to Chrome extension"""
    
    def __init__(self, model_path: str, extension_path: str):
        self.model_path = Path(model_path)
        self.extension_path = Path(extension_path)
        
    def validate_paths(self):
        """Validate model and extension paths"""
        if not self.model_path.exists():
            raise ValueError(f"Model path does not exist: {self.model_path}")
        
        if not self.extension_path.exists():
            raise ValueError(f"Extension path does not exist: {self.extension_path}")
        
        # Check for manifest.json to confirm it's the extension directory
        manifest_path = self.extension_path / "manifest.json"
        if not manifest_path.exists():
            raise ValueError(f"Not a valid extension directory (no manifest.json): {self.extension_path}")
        
        print("✓ Paths validated")
    
    def create_model_directory(self):
        """Create model directory in extension"""
        model_dir = self.extension_path / "models" / "custom"
        model_dir.mkdir(parents=True, exist_ok=True)
        print(f"✓ Created model directory: {model_dir}")
        return model_dir
    
    def copy_model_files(self, model_dir: Path):
        """Copy model files to extension"""
        print("Copying model files...")
        
        # Files to copy
        files_to_copy = [
            "webllm_config.json",
            "model_loader.js",
            "tokenizer.json",
            "tokenizer_config.json",
            "special_tokens_map.json"
        ]
        
        # Copy ONNX or quantized model files
        model_files = list(self.model_path.glob("*.onnx"))
        model_files.extend(list(self.model_path.glob("*.wasm")))
        model_files.extend(list(self.model_path.glob("*.bin")))
        
        copied_files = []
        
        # Copy configuration files
        for file_name in files_to_copy:
            src = self.model_path / file_name
            if src.exists():
                dst = model_dir / file_name
                shutil.copy2(src, dst)
                copied_files.append(file_name)
                print(f"  ✓ Copied {file_name}")
        
        # Copy model files
        for model_file in model_files:
            dst = model_dir / model_file.name
            shutil.copy2(model_file, dst)
            copied_files.append(model_file.name)
            print(f"  ✓ Copied {model_file.name}")
        
        print(f"✓ Copied {len(copied_files)} files")
        return copied_files
    
    def update_manifest(self):
        """Update manifest.json with model resources"""
        manifest_path = self.extension_path / "manifest.json"
        
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        # Add web_accessible_resources if needed
        if 'web_accessible_resources' not in manifest:
            manifest['web_accessible_resources'] = []
        
        # Add model directory to accessible resources
        model_resource = {
            "resources": ["models/custom/*"],
            "matches": ["<all_urls>"]
        }
        
        # Check if not already added
        resources_str = json.dumps(manifest['web_accessible_resources'])
        if 'models/custom' not in resources_str:
            manifest['web_accessible_resources'].append(model_resource)
            
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)
            
            print("✓ Updated manifest.json")
        else:
            print("✓ Manifest already configured")
    
    def create_integration_module(self, model_dir: Path):
        """Create integration module for the extension"""
        integration_code = '''// Auto-generated model integration
import { CustomTabCategorizerLLM } from './models/custom/webllm_integration.js';

// Initialize custom model on extension startup
let customModel = null;

export async function initializeCustomModel() {
    try {
        console.log("Initializing custom fine-tuned model...");
        customModel = new CustomTabCategorizerLLM();
        await customModel.initialize();
        console.log("Custom model initialized successfully");
        return true;
    } catch (error) {
        console.error("Failed to initialize custom model:", error);
        return false;
    }
}

export async function categorizeWithCustomModel(tabs, maxGroups) {
    if (!customModel) {
        await initializeCustomModel();
    }
    return customModel.categorizeTabs(tabs, maxGroups);
}

export function getCustomModel() {
    return customModel;
}

// Auto-initialize on module load
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onInstalled.addListener(() => {
        initializeCustomModel();
    });
}
'''
        
        # Copy webllm_integration.js to model directory
        src_integration = self.model_path.parent / "webllm_integration.js"
        if src_integration.exists():
            dst_integration = model_dir / "webllm_integration.js"
            shutil.copy2(src_integration, dst_integration)
            print("✓ Copied webllm_integration.js")
        
        # Create custom_model.js in modules directory
        modules_dir = self.extension_path / "modules"
        custom_model_path = modules_dir / "CustomModel.js"
        
        with open(custom_model_path, 'w') as f:
            f.write(integration_code)
        
        print(f"✓ Created integration module: {custom_model_path}")
        return custom_model_path
    
    def update_background_script(self):
        """Update background.js to use custom model"""
        background_path = self.extension_path / "background.js"
        
        if not background_path.exists():
            print("⚠ background.js not found, skipping integration")
            return
        
        with open(background_path, 'r') as f:
            content = f.read()
        
        # Check if already integrated
        if 'CustomModel' in content:
            print("✓ Custom model already integrated in background.js")
            return
        
        # Add import statement
        import_statement = "import { initializeCustomModel, categorizeWithCustomModel } from './modules/CustomModel.js';\n"
        
        # Find the right place to add import (after other imports)
        if 'import' in content:
            lines = content.split('\n')
            last_import_idx = 0
            for i, line in enumerate(lines):
                if line.strip().startswith('import'):
                    last_import_idx = i
            
            lines.insert(last_import_idx + 1, import_statement.strip())
            content = '\n'.join(lines)
        else:
            content = import_statement + content
        
        # Add initialization in the appropriate place
        init_code = '''
// Initialize custom fine-tuned model
initializeCustomModel().then(success => {
    if (success) {
        console.log("Using custom fine-tuned model for tab categorization");
    }
});
'''
        
        # Add after other initializations
        if 'chrome.runtime.onInstalled' in content:
            content = content.replace(
                'chrome.runtime.onInstalled.addListener',
                init_code + '\nchrome.runtime.onInstalled.addListener'
            )
        
        with open(background_path, 'w') as f:
            f.write(content)
        
        print("✓ Updated background.js")
    
    def create_deployment_info(self, model_dir: Path, copied_files: list):
        """Create deployment information file"""
        info = {
            'deployment_date': str(Path(model_dir).stat().st_mtime),
            'model_source': str(self.model_path),
            'deployed_to': str(model_dir),
            'files_deployed': copied_files,
            'integration_status': 'complete',
            'usage': {
                'initialize': 'await initializeCustomModel()',
                'categorize': 'await categorizeWithCustomModel(tabs, maxGroups)',
                'benchmark': 'await customModel.benchmark()'
            }
        }
        
        info_path = model_dir / 'deployment_info.json'
        with open(info_path, 'w') as f:
            json.dump(info, f, indent=2)
        
        print(f"✓ Created deployment info: {info_path}")
    
    def test_deployment(self):
        """Test the deployment"""
        print("\nTesting deployment...")
        
        # Check if all necessary files exist
        model_dir = self.extension_path / "models" / "custom"
        required_files = [
            model_dir / "webllm_config.json",
            model_dir / "model_loader.js",
            self.extension_path / "modules" / "CustomModel.js"
        ]
        
        all_present = True
        for file in required_files:
            if file.exists():
                print(f"  ✓ {file.name} present")
            else:
                print(f"  ✗ {file.name} missing")
                all_present = False
        
        if all_present:
            print("\n✅ Deployment successful!")
        else:
            print("\n⚠ Some files are missing. Please check the deployment.")
        
        return all_present
    
    def deploy(self):
        """Main deployment process"""
        print("Starting model deployment...")
        print(f"Model: {self.model_path}")
        print(f"Extension: {self.extension_path}")
        print()
        
        # Validate paths
        self.validate_paths()
        
        # Create model directory
        model_dir = self.create_model_directory()
        
        # Copy model files
        copied_files = self.copy_model_files(model_dir)
        
        # Update manifest
        self.update_manifest()
        
        # Create integration module
        self.create_integration_module(model_dir)
        
        # Update background script
        self.update_background_script()
        
        # Create deployment info
        self.create_deployment_info(model_dir, copied_files)
        
        # Test deployment
        success = self.test_deployment()
        
        if success:
            print("\n" + "="*60)
            print("DEPLOYMENT COMPLETE")
            print("="*60)
            print("\nNext steps:")
            print("1. Reload the extension in Chrome (chrome://extensions)")
            print("2. Check console for 'Custom model initialized successfully'")
            print("3. Test tab categorization")
            print("4. Run benchmark: await customModel.benchmark()")
            print("\nThe extension will now use your fine-tuned model!")
        
        return success

def main():
    parser = argparse.ArgumentParser(description='Deploy fine-tuned model to Chrome extension')
    parser.add_argument('--model', type=str, required=True,
                       help='Path to WebLLM-converted model directory')
    parser.add_argument('--extension', type=str, default='..',
                       help='Path to Chrome extension directory')
    parser.add_argument('--test-only', action='store_true',
                       help='Test deployment without making changes')
    
    args = parser.parse_args()
    
    deployer = ModelDeployer(args.model, args.extension)
    
    if args.test_only:
        deployer.validate_paths()
        print("✅ Validation passed. Ready to deploy.")
    else:
        success = deployer.deploy()
        if not success:
            exit(1)

if __name__ == '__main__':
    main()