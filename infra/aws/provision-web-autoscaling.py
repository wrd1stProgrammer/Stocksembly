"""Run in an authenticated AWS CloudShell. Never launches a second web on setup.

Uploads web-asg-bootstrap.sh and role-deploy.sh before running this script.
DNS alias cutover is deliberately separate, after HTTPS target health is checked.
"""
import base64
import json
import boto3

REGION = 'us-east-1'
ACCOUNT = '359463332817'
VPC = 'vpc-003c697e0034f28e7'
WEB = 'i-07b01a4145abcedd1'
WEB_SG = 'sg-0dd370e525ead2903'
SUBNETS = ['subnet-07e12ce381ada71f7', 'subnet-0763b161458e2bef8']
GROUP = 'stocksembly-web'
BUCKET = 'stocksembly-prod-359463332817-us-east-1'
e = boto3.client('ec2', region_name=REGION)
lb = boto3.client('elbv2', region_name=REGION)
auto = boto3.client('autoscaling', region_name=REGION)
iam = boto3.client('iam')
ssm = boto3.client('ssm', region_name=REGION)

security = e.describe_security_groups(Filters=[{'Name':'vpc-id','Values':[VPC]}, {'Name':'group-name','Values':['stocksembly-alb']}])['SecurityGroups']
sg = security[0]['GroupId'] if security else e.create_security_group(GroupName='stocksembly-alb', Description='Public HTTPS entry to web targets', VpcId=VPC)['GroupId']
def ingress(group, permissions):
    try: e.authorize_security_group_ingress(GroupId=group, IpPermissions=permissions)
    except e.exceptions.ClientError as error:
        if error.response['Error']['Code'] != 'InvalidPermission.Duplicate': raise

ingress(sg, [{'IpProtocol':'tcp','FromPort':p,'ToPort':p,'IpRanges':[{'CidrIp':'0.0.0.0/0'}]} for p in [80,443]])
ingress(WEB_SG, [{'IpProtocol':'tcp','FromPort':8080,'ToPort':8080,'UserIdGroupPairs':[{'GroupId':sg}]}])
existing = [x for x in lb.describe_load_balancers()['LoadBalancers'] if x['LoadBalancerName'] == 'stocksembly-web']
alb = existing[0] if existing else lb.create_load_balancer(Name='stocksembly-web', Subnets=SUBNETS, SecurityGroups=[sg], Scheme='internet-facing', Type='application', IpAddressType='ipv4', Tags=[{'Key':'Service','Value':'stocksembly'}])['LoadBalancers'][0]
lb.modify_load_balancer_attributes(LoadBalancerArn=alb['LoadBalancerArn'], Attributes=[{'Key':'idle_timeout.timeout_seconds','Value':'600'},{'Key':'deletion_protection.enabled','Value':'true'}])
targets = [x for x in lb.describe_target_groups()['TargetGroups'] if x['TargetGroupName']=='stocksembly-web']
tg = targets[0] if targets else lb.create_target_group(Name='stocksembly-web',Protocol='HTTP',Port=8080,VpcId=VPC,TargetType='instance',HealthCheckPath='/api/health',HealthCheckIntervalSeconds=30,HealthCheckTimeoutSeconds=5,HealthyThresholdCount=2,UnhealthyThresholdCount=5,Matcher={'HttpCode':'200'})['TargetGroups'][0]
lb.modify_target_group_attributes(TargetGroupArn=tg['TargetGroupArn'],Attributes=[{'Key':'deregistration_delay.timeout_seconds','Value':'120'}])
lb.register_targets(TargetGroupArn=tg['TargetGroupArn'], Targets=[{'Id':WEB}])
listeners = lb.describe_listeners(LoadBalancerArn=alb['LoadBalancerArn'])['Listeners']
if not any(x['Port']==80 for x in listeners):
    lb.create_listener(LoadBalancerArn=alb['LoadBalancerArn'],Protocol='HTTP',Port=80,DefaultActions=[{'Type':'redirect','RedirectConfig':{'Protocol':'HTTPS','Port':'443','StatusCode':'HTTP_301'}}])
cert = 'arn:aws:acm:us-east-1:359463332817:certificate/8ea1fbf2-d199-4aff-a4c4-5b58722a97fe'
if boto3.client('acm',region_name=REGION).describe_certificate(CertificateArn=cert)['Certificate']['Status']=='ISSUED' and not any(x['Port']==443 for x in listeners):
    lb.create_listener(LoadBalancerArn=alb['LoadBalancerArn'],Protocol='HTTPS',Port=443,Certificates=[{'CertificateArn':cert}],SslPolicy='ELBSecurityPolicy-TLS13-1-2-2021-06',DefaultActions=[{'Type':'forward','TargetGroupArn':tg['TargetGroupArn']}])

# Fetch the managed bootstrap object; configuration secrets never enter user data.
user_data = f'''#!/bin/bash
set -euo pipefail
aws s3 cp s3://{BUCKET}/operations/web/web-asg-bootstrap.sh /run/web-bootstrap.sh --region {REGION} --only-show-errors
bash /run/web-bootstrap.sh
'''
launch = dict(ImageId='ami-0006118602dfc1c09',InstanceType='t3.medium',KeyName='stocksembly-web-worker-20260913',IamInstanceProfile={'Name':'stocksembly-web-runtime'},NetworkInterfaces=[{'DeviceIndex':0,'AssociatePublicIpAddress':True,'Groups':[WEB_SG]}],MetadataOptions={'HttpTokens':'required','HttpPutResponseHopLimit':2},Monitoring={'Enabled':True},BlockDeviceMappings=[{'DeviceName':'/dev/xvda','Ebs':{'VolumeSize':40,'VolumeType':'gp3','Encrypted':True,'DeleteOnTermination':True}}],UserData=base64.b64encode(user_data.encode()).decode())
templates=e.describe_launch_templates(Filters=[{'Name':'launch-template-name','Values':['stocksembly-web']}])['LaunchTemplates']
if templates:
    template=templates[0]
    version=e.create_launch_template_version(LaunchTemplateId=template['LaunchTemplateId'],LaunchTemplateData=launch)['LaunchTemplateVersion']['VersionNumber']
else:
    template=e.create_launch_template(LaunchTemplateName='stocksembly-web',LaunchTemplateData=launch)['LaunchTemplate']
    version=1
lt={'LaunchTemplateId':template['LaunchTemplateId'],'Version':str(version)}
groups=auto.describe_auto_scaling_groups(AutoScalingGroupNames=[GROUP])['AutoScalingGroups']
if not groups:
    # Attach increments desired capacity by one. Starting at zero avoids creating
    # a spare instance just to attach the existing healthy production server.
    auto.create_auto_scaling_group(AutoScalingGroupName=GROUP,LaunchTemplate=lt,MinSize=0,MaxSize=1,DesiredCapacity=0,VPCZoneIdentifier=','.join(SUBNETS),HealthCheckType='EC2',HealthCheckGracePeriod=900,DefaultInstanceWarmup=300,TargetGroupARNs=[tg['TargetGroupArn']],Tags=[{'Key':'Service','Value':'stocksembly','PropagateAtLaunch':True},{'Key':'stocksembly:role','Value':'web','PropagateAtLaunch':True}])
    auto.suspend_processes(AutoScalingGroupName=GROUP,ScalingProcesses=['AlarmNotification','AZRebalance'])
    auto.attach_instances(AutoScalingGroupName=GROUP,InstanceIds=[WEB])
    auto.update_auto_scaling_group(AutoScalingGroupName=GROUP,MinSize=1,MaxSize=1)
else:
    auto.update_auto_scaling_group(AutoScalingGroupName=GROUP,LaunchTemplate=lt)
# Keep scale-out gated at one until the entire bootstrap and rollout are verified.
for policy in auto.describe_policies(AutoScalingGroupName=GROUP)['ScalingPolicies']:
    if policy['PolicyName'] == 'web-cpu-55':
        auto.delete_policy(AutoScalingGroupName=GROUP, PolicyName=policy['PolicyName'])
auto.put_scaling_policy(AutoScalingGroupName=GROUP,PolicyName='web-cpu-35',PolicyType='TargetTrackingScaling',TargetTrackingConfiguration={'PredefinedMetricSpecification':{'PredefinedMetricType':'ASGAverageCPUUtilization'},'TargetValue':35.0,'DisableScaleIn':False},EstimatedInstanceWarmup=300)
e.monitor_instances(InstanceIds=[WEB])
e.create_tags(Resources=[WEB],Tags=[{'Key':'stocksembly:role','Value':'web'}])
print(json.dumps({'alb':alb['LoadBalancerArn'],'dns':alb['DNSName'],'aliasZone':alb['CanonicalHostedZoneId'],'targetGroup':tg['TargetGroupArn'],'group':GROUP,'launchTemplate':lt,'baseline':1}))
