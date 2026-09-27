import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add the helper function
    helper = '''
function formatDisplayTime(timeStr) {
  if (!timeStr) return '--:--';
  const str = String(timeStr);
  if (str.length >= 16 && (str.includes('T') || str.includes(' '))) {
    return str.slice(11, 16);
  }
  return str.slice(0, 5);
}
'''
    # Insert helper before function App() {
    idx = content.find('function App() {')
    if idx != -1:
        content = content[:idx] + helper + content[idx:]
    
    # Replace shift.start.slice(0, 5) -> formatDisplayTime(shift.start)
    content = re.sub(r'([a-zA-Z0-9_?.\[\]]+(?:\.start|\.end|\.check_in|\.check_out|\.check_in_time|\.check_out_time))\?*\.slice\([0-9, ]+\)', r'formatDisplayTime(\1)', content)

    # Specific replacements 
    content = content.replace("record.check_in?.slice(11, 16) || '--:--'", "formatDisplayTime(record.check_in)")
    content = content.replace("record.check_out?.slice(11, 16) || '--:--'", "formatDisplayTime(record.check_out)")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
