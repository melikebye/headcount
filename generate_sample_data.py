import random, csv, datetime as dt
random.seed(7)
ROOMS=[("Infants A",9),("Infants B",8),("Ones",11),("Twos A",16),("Twos B",14),("Threes",22),("Fours A",23),("Fours B",20)]
SLOTS={"Infants A":2,"Infants B":2,"Ones":2,"Twos A":2,"Twos B":2,"Threes":2,"Fours A":2,"Fours B":1}
start=dt.date(2026,8,17)  # Monday; 5 weeks -> through Sep 18
days=[start+dt.timedelta(d) for d in range(35) if (start+dt.timedelta(d)).weekday()<5]
def fmt(m): 
    h,mi=divmod(int(m),60); ap="AM" if h<12 else "PM"; h12=h%12 or 12
    return f"{h12}:{mi:02d} {ap}"
def clip(x,a,b): return max(a,min(b,x))
kids=[];cid=100
for room,n in ROOMS:
    for i in range(n):
        cid+=random.randint(1,4)
        arr=clip(random.gauss(8*60,40),6*60+30,9*60+30)
        part = room in("Threes","Fours A","Fours B") and random.random()<0.18
        dep=clip(random.gauss(12*60+40,15),12*60,13*60+15) if part else clip(random.gauss(16*60+50,45),14*60+30,18*60)
        kids.append(dict(id=f"Child {cid:04d}",room=room,arr=arr,dep=dep,rate=random.uniform(0.86,0.98)))
att={0:0.95,1:1.0,2:1.0,3:0.99,4:0.88}
rows=[]
for d in days:
    wd=d.weekday()
    for k in kids:
        if random.random()>k["rate"]*att[wd]: continue
        a=clip(k["arr"]+random.gauss(0,12),6*60+30,10*60+30)
        e=clip(k["dep"]+random.gauss(0,15)-(25 if wd==4 else 0),a+120,18*60)
        rows.append([k["id"],k["room"],d.strftime("%m/%d/%Y"),fmt(a),fmt(e),f"{(int(e)-int(a))/60:.2f}","Parent/Guardian","Parent/Guardian"])
with open("sample_checkin_report.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["Student","Room","Date","Check-in Time","Check-out Time","Total Hours","Checked In By","Checked Out By"]); w.writerows(rows)
first=["Maya","Jordan","Priya","Luis","Hannah","Deshawn","Camila","Owen","Aisha","Tyler","Sofia","Marcus","Elena","Noah","Grace","Andre","Leila","Ben","Rosa","Kevin","Tasha","Emil","Nora","Victor","Imani","Cole","Paige","Rafael","June","Silas"]
last="RKMTBWLCHDGPSAFNEVJO"
staff=[];i=0
for room,_ in ROOMS:
    for s in range(SLOTS[room]):
        for kind in (("open","close") if s==0 else ("mid",)):
            staff.append((f"{first[i]} {last[i%len(last)]}.",room,kind)); i+=1
trows=[]
for d in days:
    for name,room,kind in staff:
        a,e={"open":(6*60+30,14*60+30),"close":(10*60,18*60),"mid":(7*60+30,16*60+30)}[kind]
        a+=random.randint(-4,3); e+=random.randint(-2,6)
        a=max(a,6*60+26)
        trows.append([name,room,d.strftime("%m/%d/%Y"),fmt(a),fmt(e),f"{(e-a)/60:.2f}"])
with open("sample_staff_timecards.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["Staff Member","Room","Date","Time In","Time Out","Total Hours"]); w.writerows(trows)
print(len(rows),len(trows),len(staff))
