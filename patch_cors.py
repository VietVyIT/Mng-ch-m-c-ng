import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old_cors = '''app.use(cors({ 
  origin: env.clientUrl ? env.clientUrl.trim() : true,
  credentials: true 
}));'''

    new_cors = '''app.use(cors({ 
  origin: env.clientUrl && env.clientUrl != 'http://localhost' ? env.clientUrl.trim() : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));'''

    new_content = content.replace(old_cors, new_cors)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/app.js')
