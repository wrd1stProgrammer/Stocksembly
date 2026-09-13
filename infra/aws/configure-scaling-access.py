"""Narrow permissions for ASG bootstrap, fleet deployments and queue monitoring."""
import json
import boto3

iam = boto3.client('iam')
def allow(actions, resources, **extra):
    return dict(Effect='Allow', Action=actions, Resource=resources, **extra)
def put(role, name, statements):
    iam.put_role_policy(RoleName=role, PolicyName=name, PolicyDocument=json.dumps({'Version':'2012-10-17','Statement':statements}))
base='arn:aws:'
region='us-east-1'
account='359463332817'
secret='arn:aws:secretsmanager:us-east-1:359463332817:secret:stocksembly/prod/web-bootstrap-hykZFp'
objects='arn:aws:s3:::stocksembly-prod-359463332817-us-east-1/operations/web/*'
parameters='arn:aws:ssm:us-east-1:359463332817:parameter/stocksembly/prod/web/*'
put('stocksembly-web-runtime','web-autoscaling-bootstrap',[
    allow(['secretsmanager:GetSecretValue','secretsmanager:PutSecretValue'],secret),
    allow(['s3:GetObject'],objects), allow(['ssm:GetParameter'],parameters),
])
put('stocksembly-github-deploy','web-autoscaling-deploy',[
    allow(['autoscaling:DescribeAutoScalingGroups','elasticloadbalancing:DescribeTargetHealth'],'*'),
    allow(['ssm:SendCommand'],'arn:aws:ec2:us-east-1:359463332817:instance/*',Condition={'StringEquals':{'ssm:resourceTag/stocksembly:role':'web'}}),
    allow(['ssm:GetParameter','ssm:PutParameter'],parameters),
    allow(['s3:PutObject'],objects),
    allow(['elasticloadbalancing:RegisterTargets','elasticloadbalancing:DeregisterTargets'],'arn:aws:elasticloadbalancing:us-east-1:359463332817:targetgroup/stocksembly-web/*'),
])
put('stocksembly-prod-ApplicationRole-C9rYQuuHD15B','research-queue-metrics',[
    allow(['cloudwatch:PutMetricData'],'*',Condition={'StringEquals':{'cloudwatch:namespace':'Stocksembly/Research'}}),
])
cw=boto3.client('cloudwatch',region_name=region)
for name, metric, threshold in [('research-queue-wait','OldestQueuedResearchSeconds',300),('research-queue-depth','QueuedResearchRuns',3)]:
    cw.put_metric_alarm(AlarmName=name, Namespace='Stocksembly/Research',MetricName=metric,Dimensions=[{'Name':'Service','Value':'stocksembly'}],Statistic='Maximum',Period=60,EvaluationPeriods=3,Threshold=threshold,ComparisonOperator='GreaterThanThreshold',TreatMissingData='notBreaching',ActionsEnabled=False,AlarmDescription='Observation only. Worker scaling is gated pending multi-worker admission and workload measurements.')
cw.put_metric_alarm(AlarmName='research-queue-metrics-missing',Namespace='Stocksembly/Research',MetricName='QueueMetricsHeartbeat',Dimensions=[{'Name':'Service','Value':'stocksembly'}],Statistic='Minimum',Period=60,EvaluationPeriods=5,Threshold=1,ComparisonOperator='LessThanThreshold',TreatMissingData='breaching',ActionsEnabled=False)
print('Bootstrap, fleet deploy and metrics access configured; worker scaling actions disabled.')
widgets = [
    {'type':'metric','x':0,'y':0,'width':12,'height':6,'properties':{'region':region,'title':'Web CPU and desired capacity','view':'timeSeries','metrics':[['AWS/EC2','CPUUtilization','AutoScalingGroupName','stocksembly-web'],['AWS/AutoScaling','GroupDesiredCapacity','AutoScalingGroupName','stocksembly-web',{'yAxis':'right'}]],'period':60,'stat':'Average'}},
    {'type':'metric','x':12,'y':0,'width':12,'height':6,'properties':{'region':region,'title':'ALB response latency and requests','view':'timeSeries','metrics':[['AWS/ApplicationELB','TargetResponseTime','LoadBalancer','app/stocksembly-web/8db7d2b8f2a6c36f',{'stat':'p95'}],['AWS/ApplicationELB','RequestCount','LoadBalancer','app/stocksembly-web/8db7d2b8f2a6c36f',{'stat':'Sum','yAxis':'right'}]],'period':60}},
    {'type':'metric','x':0,'y':6,'width':12,'height':6,'properties':{'region':region,'title':'Authoritative PostgreSQL research queue','view':'timeSeries','metrics':[['Stocksembly/Research','QueuedResearchRuns','Service','stocksembly'],['Stocksembly/Research','ActiveResearchRuns','Service','stocksembly'],['Stocksembly/Research','OldestQueuedResearchSeconds','Service','stocksembly',{'yAxis':'right'}]],'period':60,'stat':'Maximum'}},
    {'type':'metric','x':12,'y':6,'width':12,'height':6,'properties':{'region':region,'title':'Research end-to-end duration (includes queue and repair)','view':'timeSeries','metrics':[['Stocksembly/Research','ResearchEndToEndP95Seconds24h','Service','stocksembly'],['Stocksembly/Research','CompletedResearchSamples24h','Service','stocksembly',{'yAxis':'right'}],['Stocksembly/Research','QueueMetricsHeartbeat','Service','stocksembly',{'yAxis':'right'}]],'period':300,'stat':'Maximum'}},
]
cw.put_dashboard(DashboardName='Stocksembly-scaling', DashboardBody=json.dumps({'widgets':widgets}))
boto3.client('autoscaling',region_name=region).enable_metrics_collection(AutoScalingGroupName='stocksembly-web',Granularity='1Minute',Metrics=['GroupDesiredCapacity','GroupInServiceInstances'])
